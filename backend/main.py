"""
FastAPI ↔ MQTT ↔ Lovable Cloud (Supabase) bridge.

Run:
  cd backend
  cp .env.example .env   # edit values
  pip install -r requirements.txt
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import asyncio
import json
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

import paho.mqtt.client as mqtt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import Client, create_client

load_dotenv()

# ───────────────────────── CONFIG ─────────────────────────
MQTT_HOST = os.getenv("MQTT_HOST", "192.168.1.64")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1884"))
MQTT_USERNAME = os.getenv("MQTT_USERNAME") or None
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD") or None

SUPABASE_URL = os.getenv("SUPABASE_URL", "https://bwuzyjjahvthvglpfjhj.supabase.co")
SUPABASE_KEY = os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY"
) or os.getenv("SUPABASE_PUBLISHABLE_KEY", "")

if not SUPABASE_KEY:
    raise RuntimeError(
        "Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_PUBLISHABLE_KEY in .env"
    )

sb: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ───────────────────────── STATE ─────────────────────────
ws_clients: Set[WebSocket] = set()
subscribed_topics: Set[str] = set()        # topics currently subscribed in MQTT
topic_to_bike: Dict[str, Optional[str]] = {}  # topic → bike_id
latest_per_bike: Dict[str, dict] = {}      # bike_id → last telemetry merged
loop: asyncio.AbstractEventLoop | None = None


# ───────────────────────── DB HELPERS ─────────────────────────
def db_load_topic_rows() -> List[dict]:
    res = sb.table("mqtt_topics").select("*").execute()
    return res.data or []


def db_mark_seen(topic_value: str, payload: str) -> None:
    try:
        sb.table("mqtt_topics").update(
            {
                "last_seen_at": datetime.now(timezone.utc).isoformat(),
                "last_payload": payload[:1000],
            }
        ).eq("topic", topic_value).execute()
    except Exception as e:
        print(f"[db] mark_seen failed for {topic_value}: {e}")


def db_insert_event(bike_id: Optional[str], topic_value: str, payload: Any) -> None:
    try:
        sb.table("telemetry_events").insert(
            {
                "bike_id": bike_id,
                "topic": topic_value,
                "payload": payload if isinstance(payload, (dict, list)) else {"raw": str(payload)},
            }
        ).execute()
    except Exception as e:
        print(f"[db] insert_event failed: {e}")


def db_set_mode(bike_id: str, mode: str) -> None:
    try:
        sb.table("bikes").update(
            {
                "session_mode": mode,
                "session_started_at": None
                if mode == "IDLE"
                else datetime.now(timezone.utc).isoformat(),
            }
        ).eq("id", bike_id).execute()
    except Exception as e:
        print(f"[db] set_mode failed: {e}")


def topic_for(name: str, bike_id: Optional[str], fallback: str) -> str:
    """Resolve a logical topic name (e.g. 'control') to actual MQTT topic for a bike."""
    rows = db_load_topic_rows()
    # Prefer bike-scoped match
    for r in rows:
        if r["name"] == name and r.get("bike_id") == bike_id:
            return r["topic"]
    # Fall back to a global (bike_id NULL) entry
    for r in rows:
        if r["name"] == name and r.get("bike_id") is None:
            return r["topic"]
    return fallback


# ───────────────────────── MQTT ─────────────────────────
def sync_subscriptions() -> dict:
    """Reconcile MQTT subscriptions with DB. Safe to call at any time."""
    rows = db_load_topic_rows()
    want: Set[str] = set()
    mapping: Dict[str, Optional[str]] = {}
    for r in rows:
        if r["direction"] in ("sub", "both"):
            want.add(r["topic"])
            mapping[r["topic"]] = r.get("bike_id")

    to_add = want - subscribed_topics
    to_remove = subscribed_topics - want

    for t in to_add:
        mqtt_client.subscribe(t)
        subscribed_topics.add(t)
        print(f"[MQTT] SUB + {t}")
    for t in to_remove:
        mqtt_client.unsubscribe(t)
        subscribed_topics.discard(t)
        print(f"[MQTT] SUB - {t}")

    topic_to_bike.clear()
    topic_to_bike.update(mapping)
    return {"added": sorted(to_add), "removed": sorted(to_remove), "active": sorted(want)}


def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"[MQTT] connected rc={reason_code} to {MQTT_HOST}:{MQTT_PORT}")
    sync_subscriptions()


def on_disconnect(client, userdata, *args):
    print("[MQTT] disconnected")
    subscribed_topics.clear()


def _handle_ota_status(data: dict) -> None:
    """Persist firmware/OTA status reports into the bikes table."""
    if not isinstance(data, dict):
        return
    esp32_id = data.get("esp32_id") or data.get("device_id")
    version = data.get("version") or data.get("firmware_version")
    state = data.get("state")
    progress = data.get("progress")
    message = data.get("message")
    patch: Dict[str, Any] = {}
    if version:
        patch["firmware_version"] = str(version)
        patch["firmware_reported_at"] = datetime.now(timezone.utc).isoformat()
    if state:
        patch["firmware_state"] = str(state)
    if progress is not None:
        try:
            patch["firmware_progress"] = int(progress)
        except (TypeError, ValueError):
            pass
    if message:
        patch["firmware_message"] = str(message)[:500]
    if not patch or not esp32_id:
        return
    try:
        sb.table("bikes").update(patch).eq("esp32_id", str(esp32_id)).execute()
    except Exception as e:
        print(f"[db] ota status update failed: {e}")


def on_message(client, userdata, msg):
    payload_text = msg.payload.decode("utf-8", errors="replace")
    try:
        data = json.loads(payload_text)
    except Exception:
        data = {"raw": payload_text}

    bike_id = topic_to_bike.get(msg.topic)

    # Persist last_seen + telemetry history
    db_mark_seen(msg.topic, payload_text)
    db_insert_event(bike_id, msg.topic, data)

    # OTA status → update bikes table so dashboard shows version/progress.
    # Also capture firmware_version reported inside command/status payloads.
    if "ota" in msg.topic.lower() or "command/status" in msg.topic.lower():
        _handle_ota_status(data if isinstance(data, dict) else {})

    # Build outbound message for dashboards
    out = {
        "_topic": msg.topic,
        "_bike_id": bike_id,
        "_ts": datetime.now(timezone.utc).isoformat(),
        **(data if isinstance(data, dict) else {"value": data}),
    }
    if bike_id:
        latest_per_bike.setdefault(bike_id, {}).update(out)

    if loop and loop.is_running():
        asyncio.run_coroutine_threadsafe(broadcast(out), loop)



mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
if MQTT_USERNAME:
    mqtt_client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD or "")
mqtt_client.on_connect = on_connect
mqtt_client.on_disconnect = on_disconnect
mqtt_client.on_message = on_message


# ───────────────────────── REALTIME (poll-based) ─────────────────────────
async def topic_poll_task():
    """Re-sync subscriptions every 5s so topic edits in the dashboard
    are picked up without needing a Supabase realtime websocket."""
    while True:
        try:
            sync_subscriptions()
        except Exception as e:
            print(f"[sync] error: {e}")
        await asyncio.sleep(5)


# ───────────────────────── LIFESPAN ─────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop
    loop = asyncio.get_running_loop()
    try:
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
    except Exception as e:
        print(f"[MQTT] initial connect failed ({e}); will retry in background")
    mqtt_client.loop_start()
    task = asyncio.create_task(topic_poll_task())
    yield
    task.cancel()
    mqtt_client.loop_stop()
    try:
        mqtt_client.disconnect()
    except Exception:
        pass


app = FastAPI(title="Bike MQTT Bridge", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ───────────────────────── REST: HEALTH / STATUS ─────────────────────────
@app.get("/health")
def health():
    return {
        "ok": True,
        "mqtt_connected": mqtt_client.is_connected(),
        "broker": f"{MQTT_HOST}:{MQTT_PORT}",
        "subscribed": sorted(subscribed_topics),
        "ws_clients": len(ws_clients),
    }


@app.get("/topics/status")
def topics_status():
    rows = db_load_topic_rows()
    out = []
    for r in rows:
        out.append(
            {
                "id": r["id"],
                "bike_id": r.get("bike_id"),
                "name": r["name"],
                "topic": r["topic"],
                "direction": r["direction"],
                "subscribed": r["topic"] in subscribed_topics,
                "last_seen_at": r.get("last_seen_at"),
                "last_payload": r.get("last_payload"),
            }
        )
    return out


@app.post("/topics/resync")
def topics_resync():
    return sync_subscriptions()


# ───────────────────────── REST: BROKER CONFIG ─────────────────────────
class MqttConfigIn(BaseModel):
    host: str
    port: int = 1884


@app.get("/config/mqtt")
def get_mqtt_config():
    return {"host": MQTT_HOST, "port": MQTT_PORT, "connected": mqtt_client.is_connected()}


@app.post("/config/mqtt")
def set_mqtt_config(body: MqttConfigIn):
    """Repoint the bridge at another Mosquitto broker at runtime.

    Called by the dashboard Settings panel. The change lives for the life of
    the process — persist it in .env (MQTT_HOST / MQTT_PORT) to survive a restart.
    """
    global MQTT_HOST, MQTT_PORT
    host = body.host.strip()
    if not host:
        raise HTTPException(400, "host is required")
    if not (1 <= body.port <= 65535):
        raise HTTPException(400, "port out of range")

    MQTT_HOST, MQTT_PORT = host, body.port
    subscribed_topics.clear()
    try:
        try:
            mqtt_client.disconnect()
        except Exception:
            pass
        mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
    except Exception as e:
        raise HTTPException(502, f"cannot reach broker {MQTT_HOST}:{MQTT_PORT}: {e}")
    return {"ok": True, "broker": f"{MQTT_HOST}:{MQTT_PORT}"}


# ───────────────────────── REST: BIKE CONTROL ─────────────────────────
def _publish(topic_value: str, payload: dict) -> dict:
    if not mqtt_client.is_connected():
        raise HTTPException(503, "MQTT broker not connected")
    info = mqtt_client.publish(topic_value, json.dumps(payload), qos=0, retain=False)
    return {"ok": True, "topic": topic_value, "payload": payload, "mid": info.mid}


@app.post("/bike/start")
def bike_start(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("control", bike_id, "bike/control")
    res = _publish(t, {"command": "on"})
    if bike_id:
        db_set_mode(bike_id, "ACTIVE")
    return res


@app.post("/bike/stop")
def bike_stop(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("control", bike_id, "bike/control")
    res = _publish(t, {"command": "off"})
    if bike_id:
        db_set_mode(bike_id, "IDLE")
    return res


@app.post("/simulation/start")
def sim_start(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("simulation", bike_id, "bike/simulation")
    res = _publish(t, {"command": "start"})
    if bike_id:
        db_set_mode(bike_id, "SIMULATION")
    return res


@app.post("/simulation/stop")
def sim_stop(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("simulation", bike_id, "bike/simulation")
    res = _publish(t, {"command": "stop"})
    if bike_id:
        db_set_mode(bike_id, "IDLE")
    return res


@app.post("/audio/start")
def audio_start(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("audio", bike_id, "bike/audio")
    return _publish(t, {"command": "play_start"})


@app.post("/audio/stop")
def audio_stop(bike_id: Optional[str] = Query(default=None)):
    t = topic_for("audio", bike_id, "bike/audio")
    return _publish(t, {"command": "play_stop"})


@app.post("/firmware/update")
def firmware_update(bike_id: Optional[str] = Query(default=None)):
    """Publish OTA trigger to bike/ota/update. Frontend also POSTs to /publish
    directly with the manifest url; this endpoint keeps a stable path so
    dashboards work even without knowing the manifest."""
    if not bike_id:
        raise HTTPException(400, "bike_id required")
    row = sb.table("bikes").select("firmware_target_version, esp32_id").eq("id", bike_id).maybeSingle().execute()
    target = (row.data or {}).get("firmware_target_version") if row and row.data else None
    esp = (row.data or {}).get("esp32_id") if row and row.data else None
    t = topic_for("ota_update", bike_id, "bike/ota/update")
    payload = {"command": "update", "version": target, "esp32_id": esp}
    return _publish(t, payload)


# Generic publish (for advanced control)
class PublishIn(BaseModel):
    topic: str
    payload: dict | str
    retain: bool = False


@app.post("/publish")
def publish(body: PublishIn):
    if not mqtt_client.is_connected():
        raise HTTPException(503, "MQTT broker not connected")
    msg = body.payload if isinstance(body.payload, str) else json.dumps(body.payload)
    info = mqtt_client.publish(body.topic, msg, qos=0, retain=body.retain)
    return {"ok": True, "topic": body.topic, "mid": info.mid}



# ───────────────────────── WEBSOCKET ─────────────────────────
async def broadcast(data: dict):
    if not ws_clients:
        return
    msg = json.dumps(data)
    dead = []
    for ws in list(ws_clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    # Replay latest per-bike snapshot so a fresh dashboard isn't blank
    try:
        for snap in latest_per_bike.values():
            await ws.send_text(json.dumps(snap))
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_clients.discard(ws)
