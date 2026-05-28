# Bike MQTT Backend (FastAPI)

Bridges your **Mosquitto MQTT broker** ↔ **Lovable Cloud database** ↔ **dashboard WebSocket**.

## What it does

- **Subscribes** to every topic in the `mqtt_topics` table (auto re-syncs every 5s when you add/edit topics from the UI).
- On each MQTT message: updates `mqtt_topics.last_seen_at / last_payload`, inserts a row into `telemetry_events`, and broadcasts the payload over WebSocket to all connected dashboards.
- **Publishes** control commands when the UI calls `POST /bike/start|stop` and `POST /simulation/start|stop` (per-bike via `?bike_id=...`).
- Persists `session_mode` (IDLE / ACTIVE / SIMULATION) on the `bikes` row so every dashboard sees the same state.

## Quick start

```bash
cd backend
cp .env.example .env          # set MQTT_HOST/PORT + SUPABASE_SERVICE_ROLE_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Health check:
```bash
curl http://localhost:8000/health
# { "ok": true, "mqtt_connected": true, "broker": "192.168.1.64:1884", ... }
```

## Point the dashboard at this backend

In the browser console (or in `src/lib/bike-types.ts`):
```js
window.__BIKE_API__ = "http://localhost:8000"
```
The frontend will use `http://localhost:8000` for REST and `ws://localhost:8000/ws` for live telemetry.

## Test end-to-end with mosquitto_pub

```bash
# 1) Make sure a topic exists in the dashboard (Topics tab), e.g.
#    name=telemetry  topic=bike/telemetry  direction=sub

# 2) Publish telemetry — the dashboard should light up instantly
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/telemetry \
  -m '{"esp32_id":"BIKE-01","speed":42,"ignition":true,"brake":false,
       "left_indicator":true,"right_indicator":false,
       "left_leg":false,"right_leg":true,"heartbeat":true}'

# 3) Trigger control from the dashboard → confirm it arrives on the broker
mosquitto_sub -h 192.168.1.64 -p 1884 -t "bike/#" -v
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET  | `/health` | MQTT connection + subscribed topics |
| GET  | `/topics/status` | Per-topic subscribed flag + last_seen |
| POST | `/topics/resync` | Force re-read topics from DB |
| POST | `/bike/start?bike_id=...` | publishes `{"command":"on"}` on the bike's `control` topic |
| POST | `/bike/stop?bike_id=...` | publishes `{"command":"off"}` |
| POST | `/simulation/start?bike_id=...` | publishes `{"command":"start"}` on `simulation` topic |
| POST | `/simulation/stop?bike_id=...` | publishes `{"command":"stop"}` |
| POST | `/publish` | `{topic, payload, retain}` — generic publish |
| WS   | `/ws` | broadcasts every received MQTT message as JSON |

## How topic resolution works

For each control endpoint, the backend looks up the row in `mqtt_topics` where `name` matches (`control` or `simulation`) — first scoped to the given `bike_id`, then falling back to a global (`bike_id IS NULL`) entry, then to a hard-coded default (`bike/control`, `bike/simulation`).

So you can:
- leave a single global `control` topic for all bikes, **or**
- create a per-bike `control` row with `topic = bikes/BIKE-01/control` to isolate them.

## Topic changes are picked up automatically

A background task calls `sync_subscriptions()` every 5 seconds, diffs the DB against `subscribed_topics`, and `subscribe()`/`unsubscribe()` accordingly. You can also force it with `POST /topics/resync`.
