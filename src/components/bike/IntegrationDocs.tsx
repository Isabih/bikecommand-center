import { motion } from "framer-motion";
import { Copy, Database, Radio, Server, Terminal, Webhook } from "lucide-react";
import { toast } from "sonner";

const PG_URL_HINT =
  "postgresql+psycopg://postgres.bwuzyjjahvthvglpfjhj:<DB_PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";

const FASTAPI_CODE = `# main.py — FastAPI + MQTT + Lovable Cloud Postgres
# pip install fastapi "uvicorn[standard]" paho-mqtt sqlalchemy psycopg[binary] python-dotenv

import asyncio, json, os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Dict, List, Set

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import paho.mqtt.client as mqtt

# ---------- CONFIG ----------
MQTT_HOST = os.getenv("MQTT_HOST", "192.168.1.64")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1884"))

# Lovable Cloud / Supabase Postgres (pooler connection string)
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "${PG_URL_HINT}",
)
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

# ---------- TOPIC LOOKUP (from cloud DB) ----------
def db_load_topics() -> Dict[str, dict]:
    with SessionLocal() as s:
        rows = s.execute(text(
            "select id, name, topic, direction from public.mqtt_topics"
        )).mappings().all()
    return {r["name"]: dict(r) for r in rows}

def topic_for(name: str, fallback: str) -> str:
    t = db_load_topics().get(name)
    return t["topic"] if t else fallback

def db_mark_seen(topic_value: str, payload: str):
    with SessionLocal() as s:
        s.execute(text("""
            update public.mqtt_topics
               set last_seen_at = now(),
                   last_payload = :p
             where topic = :t
        """), {"t": topic_value, "p": payload[:1000]})
        s.commit()

# ---------- MQTT ----------
ws_clients: Set[WebSocket] = set()
latest_telemetry: dict = {}

def on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"[MQTT] connected rc={reason_code}")
    # Subscribe to every 'sub' / 'both' topic stored in the DB
    for row in db_load_topics().values():
        if row["direction"] in ("sub", "both"):
            client.subscribe(row["topic"])
            print(f"[MQTT] SUB {row['topic']}")

def on_message(client, userdata, msg):
    payload = msg.payload.decode("utf-8", errors="replace")
    db_mark_seen(msg.topic, payload)
    # Parse telemetry JSON if applicable, broadcast to dashboards via WS
    try:
        data = json.loads(payload)
    except Exception:
        data = {"raw": payload}
    data["_topic"] = msg.topic
    data["_ts"] = datetime.now(timezone.utc).isoformat()
    latest_telemetry.update(data)
    asyncio.run_coroutine_threadsafe(broadcast(data), loop)

mqtt_client = mqtt.Client(callback_api_version=mqtt.CallbackAPIVersion.VERSION2)
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message

# ---------- LIFESPAN ----------
loop: asyncio.AbstractEventLoop
sim_task: asyncio.Task | None = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global loop
    loop = asyncio.get_running_loop()
    mqtt_client.connect(MQTT_HOST, MQTT_PORT, 60)
    mqtt_client.loop_start()
    yield
    mqtt_client.loop_stop()
    mqtt_client.disconnect()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

# ---------- REST: BIKE CONTROL ----------
@app.post("/bike/start")
def bike_start():
    t = topic_for("control", "bike/control")
    mqtt_client.publish(t, json.dumps({"command": "on"}))
    return {"ok": True, "topic": t, "command": "on"}

@app.post("/bike/stop")
def bike_stop():
    t = topic_for("control", "bike/control")
    mqtt_client.publish(t, json.dumps({"command": "off"}))
    return {"ok": True, "topic": t, "command": "off"}

@app.post("/simulation/start")
def sim_start():
    t = topic_for("simulation", "bike/simulation")
    mqtt_client.publish(t, json.dumps({"command": "start"}))
    return {"ok": True, "topic": t, "command": "start"}

@app.post("/simulation/stop")
def sim_stop():
    t = topic_for("simulation", "bike/simulation")
    mqtt_client.publish(t, json.dumps({"command": "stop"}))
    return {"ok": True, "topic": t, "command": "stop"}

# ---------- REST: TOPICS (optional — UI talks to DB directly) ----------
class TopicIn(BaseModel):
    name: str
    topic: str
    description: str | None = None
    direction: str = "sub"

@app.get("/topics")
def list_topics():
    with SessionLocal() as s:
        return [dict(r) for r in s.execute(text(
            "select * from public.mqtt_topics order by name"
        )).mappings()]

@app.post("/topics")
def create_topic(body: TopicIn):
    with SessionLocal() as s:
        row = s.execute(text("""
            insert into public.mqtt_topics (name, topic, description, direction)
            values (:name, :topic, :description, :direction)
            returning *
        """), body.model_dump()).mappings().one()
        s.commit()
    # Re-subscribe immediately
    if row["direction"] in ("sub", "both"):
        mqtt_client.subscribe(row["topic"])
    return dict(row)

@app.put("/topics/{name}")
def update_topic(name: str, body: TopicIn):
    with SessionLocal() as s:
        row = s.execute(text("""
            update public.mqtt_topics
               set topic = :topic, description = :description, direction = :direction
             where name = :name
            returning *
        """), {**body.model_dump(), "name": name}).mappings().first()
        if not row:
            raise HTTPException(404, "Topic not found")
        s.commit()
    return dict(row)

@app.delete("/topics/{name}")
def delete_topic(name: str):
    with SessionLocal() as s:
        s.execute(text("delete from public.mqtt_topics where name = :n"), {"n": name})
        s.commit()
    return {"ok": True}

# ---------- WEBSOCKET ----------
async def broadcast(data: dict):
    dead = []
    msg = json.dumps(data)
    for ws in ws_clients:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_clients.discard(ws)

@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    ws_clients.add(ws)
    if latest_telemetry:
        await ws.send_text(json.dumps(latest_telemetry))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_clients.discard(ws)

# uvicorn main:app --host 0.0.0.0 --port 8000 --reload
`;

const MQTT_CHEATSHEET = `# ACTIVE MODE
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/control -m '{"command":"on"}'
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/control -m '{"command":"off"}'

# SIMULATION
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/simulation -m '{"command":"start"}'
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/simulation -m '{"command":"stop"}'

# MONITOR ALL
mosquitto_sub -h 192.168.1.64 -p 1884 -t "bike/#"
`;

const ENV_EXAMPLE = `# .env  (FastAPI backend)
MQTT_HOST=192.168.1.64
MQTT_PORT=1884
DATABASE_URL=${PG_URL_HINT}
`;

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  return (
    <div className="relative group">
      <button
        onClick={() => {
          navigator.clipboard.writeText(code);
          toast.success("Copied");
        }}
        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <Copy className="h-3 w-3" /> Copy
      </button>
      <pre className="overflow-x-auto rounded-lg border border-white/8 bg-black/40 p-3 text-[11px] leading-relaxed font-mono text-foreground/85 max-h-[420px]">
        <code>{code}</code>
      </pre>
      {lang && (
        <div className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.22em] text-muted-foreground/70 font-mono">
          {lang}
        </div>
      )}
    </div>
  );
}

export function IntegrationDocs() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 space-y-5"
    >
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">
          FastAPI ↔ Lovable Cloud Integration
        </h2>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
          Topics live in Postgres · FastAPI bridges MQTT ↔ Dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 flex items-start gap-2">
          <Database className="h-4 w-4 neon-text-cyan mt-0.5" />
          <div>
            <div className="font-semibold uppercase tracking-[0.2em] text-foreground/90 mb-1">Database</div>
            Topics are stored in <code className="font-mono neon-text-cyan">public.mqtt_topics</code> in Lovable Cloud. The dashboard reads/writes directly via Supabase; FastAPI reads the same table to know which topics to subscribe to.
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 flex items-start gap-2">
          <Radio className="h-4 w-4 neon-text-cyan mt-0.5" />
          <div>
            <div className="font-semibold uppercase tracking-[0.2em] text-foreground/90 mb-1">MQTT Broker</div>
            <code className="font-mono">192.168.1.64:1884</code>. FastAPI publishes control commands and subscribes to telemetry. Every received message updates <code className="font-mono">last_seen_at</code>.
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 flex items-start gap-2">
          <Server className="h-4 w-4 neon-text-cyan mt-0.5" />
          <div>
            <div className="font-semibold uppercase tracking-[0.2em] text-foreground/90 mb-1">REST endpoints</div>
            <code className="font-mono">POST /bike/start</code>, <code className="font-mono">/bike/stop</code>, <code className="font-mono">/simulation/start</code>, <code className="font-mono">/simulation/stop</code>, <code className="font-mono">GET|POST /topics</code>, <code className="font-mono">PUT|DELETE /topics/{"{name}"}</code>.
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3 flex items-start gap-2">
          <Webhook className="h-4 w-4 neon-text-cyan mt-0.5" />
          <div>
            <div className="font-semibold uppercase tracking-[0.2em] text-foreground/90 mb-1">WebSocket</div>
            <code className="font-mono">ws://localhost:8000/ws</code> broadcasts every MQTT message it receives so the dashboard updates in real time.
          </div>
        </div>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Terminal className="h-3 w-3" /> 1 · Environment
        </div>
        <CodeBlock code={ENV_EXAMPLE} lang="env" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Get the DB password and exact pooler URI from <span className="font-mono">Lovable Cloud → Backend → Project Settings → Database</span>.
        </p>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Server className="h-3 w-3" /> 2 · main.py (drop-in)
        </div>
        <CodeBlock code={FASTAPI_CODE} lang="python" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Radio className="h-3 w-3" /> 3 · MQTT cheatsheet (manual testing)
        </div>
        <CodeBlock code={MQTT_CHEATSHEET} lang="bash" />
      </div>

      <div className="rounded-lg border border-[oklch(0.85_0.18_200/0.3)] bg-[oklch(0.85_0.18_200/0.04)] p-3 text-[11px] text-foreground/85">
        <div className="font-semibold uppercase tracking-[0.2em] neon-text-cyan mb-1">Where to edit what</div>
        <ul className="space-y-1 list-disc pl-4">
          <li><b>Add / remove / rename topics</b> → the <span className="neon-text-cyan">MQTT Topics</span> panel above. Changes are saved to <code className="font-mono">mqtt_topics</code> instantly.</li>
          <li><b>Change MQTT broker IP/port</b> → <code className="font-mono">.env</code> (<code className="font-mono">MQTT_HOST</code> / <code className="font-mono">MQTT_PORT</code>).</li>
          <li><b>Change control payload format</b> → <code className="font-mono">@app.post("/bike/start")</code> in <code className="font-mono">main.py</code>.</li>
          <li><b>Add new message handler</b> → branch on <code className="font-mono">msg.topic</code> inside <code className="font-mono">on_message()</code>.</li>
          <li><b>Persist telemetry history</b> → add a <code className="font-mono">telemetry</code> table and <code className="font-mono">INSERT</code> inside <code className="font-mono">on_message()</code>.</li>
          <li><b>Point dashboard to a remote backend</b> → set <code className="font-mono">window.__BIKE_API__</code> or edit <code className="font-mono">API_BASE</code> in <code className="font-mono">src/lib/bike-types.ts</code>.</li>
        </ul>
      </div>
    </motion.section>
  );
}
