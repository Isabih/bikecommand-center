import { motion } from "framer-motion";
import { BookOpen, Database, Server, Workflow } from "lucide-react";

function Code({ children }: { children: string }) {
  return (
    <pre className="rounded-lg border border-white/8 bg-black/40 p-3 text-[11px] leading-relaxed overflow-x-auto font-mono text-foreground/90">
      <code>{children}</code>
    </pre>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Server;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 neon-text-cyan" />
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] neon-text-cyan">{title}</h3>
      </div>
      <div className="space-y-2 text-xs text-foreground/80 leading-relaxed">{children}</div>
    </div>
  );
}

export function IntegrationDocs() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Integration Guide
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            FastAPI · MQTT · MySQL · WebSocket
          </p>
        </div>
      </div>

      <Section icon={Workflow} title="1. Endpoints expected by this dashboard">
        <ul className="list-disc pl-5 space-y-1">
          <li><span className="font-mono neon-text-cyan">POST /bike/start</span> — start session (ignition on, MQTT publish)</li>
          <li><span className="font-mono neon-text-cyan">POST /bike/stop</span> — stop session</li>
          <li><span className="font-mono neon-text-cyan">POST /simulation/start</span> — start fake telemetry generator</li>
          <li><span className="font-mono neon-text-cyan">POST /simulation/stop</span> — stop generator</li>
          <li><span className="font-mono neon-text-cyan">GET /topics</span> — list MQTT topic bindings</li>
          <li><span className="font-mono neon-text-cyan">PUT /topics/{"{name}"}</span> — update one binding</li>
          <li><span className="font-mono neon-text-cyan">WS /ws</span> — broadcasts JSON telemetry frames</li>
        </ul>
      </Section>

      <Section icon={Database} title="2. MySQL schema (topics + telemetry)">
        <Code>{`CREATE TABLE topics (
  name        VARCHAR(64) PRIMARY KEY,
  topic       VARCHAR(255) NOT NULL,
  description VARCHAR(255) DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO topics (name, topic) VALUES
  ('start',          'bike/control/start'),
  ('stop',           'bike/control/stop'),
  ('telemetry',      'bike/esp32/telemetry'),
  ('heartbeat',      'bike/esp32/heartbeat'),
  ('left_indicator', 'bike/esp32/indicator/left'),
  ('right_indicator','bike/esp32/indicator/right'),
  ('brake',          'bike/esp32/brake'),
  ('left_leg',       'bike/esp32/leg/left'),
  ('right_leg',      'bike/esp32/leg/right');

CREATE TABLE telemetry (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  esp32_id   VARCHAR(64),
  speed      FLOAT,
  ignition   BOOLEAN,
  brake      BOOLEAN,
  payload    JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);`}</Code>
      </Section>

      <Section icon={Server} title="3. FastAPI backend (main.py)">
        <p>
          Minimal reference using <span className="font-mono">fastapi</span>,{" "}
          <span className="font-mono">paho-mqtt</span>, and{" "}
          <span className="font-mono">sqlalchemy</span> (mysql+pymysql driver).
        </p>
        <Code>{`from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio, json, paho.mqtt.client as mqtt
from sqlalchemy import create_engine, text

DB = create_engine("mysql+pymysql://user:pass@localhost/bike")
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

clients: set[WebSocket] = set()
loop = asyncio.get_event_loop()

# ---------- Topics (loaded from MySQL) ----------
def load_topics() -> dict[str, str]:
    with DB.connect() as c:
        rows = c.execute(text("SELECT name, topic FROM topics")).all()
    return {r.name: r.topic for r in rows}

TOPICS = load_topics()

# ---------- MQTT ----------
mq = mqtt.Client()
def on_connect(c, *_):
    # subscribe to every "incoming" topic
    for name, t in TOPICS.items():
        if name not in ("start", "stop"):
            c.subscribe(t)

def on_message(_c, _u, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception:
        payload = {"raw": msg.payload.decode(errors="ignore")}
    # persist
    with DB.begin() as c:
        c.execute(text(
            "INSERT INTO telemetry (esp32_id, speed, ignition, brake, payload) "
            "VALUES (:id, :sp, :ig, :br, :pl)"
        ), dict(id=payload.get("esp32_id"), sp=payload.get("speed", 0),
                ig=payload.get("ignition", False), br=payload.get("brake", False),
                pl=json.dumps(payload)))
    # broadcast to WS clients
    asyncio.run_coroutine_threadsafe(broadcast(payload), loop)

mq.on_connect = on_connect
mq.on_message = on_message
mq.connect("localhost", 1883)
mq.loop_start()

async def broadcast(data: dict):
    dead = []
    for ws in clients:
        try: await ws.send_json(data)
        except: dead.append(ws)
    for d in dead: clients.discard(d)

# ---------- REST ----------
@app.post("/bike/start")
def bike_start():
    mq.publish(TOPICS["start"], json.dumps({"cmd": "start"}))
    return {"ok": True}

@app.post("/bike/stop")
def bike_stop():
    mq.publish(TOPICS["stop"], json.dumps({"cmd": "stop"}))
    return {"ok": True}

# simulation toggles a background task that publishes fake frames
SIM_TASK: asyncio.Task | None = None
async def simulate():
    import random
    while True:
        frame = {"esp32_id": "SIM-01", "speed": random.uniform(0, 80),
                 "ignition": True, "brake": random.random() < 0.1,
                 "left_indicator": False, "right_indicator": False,
                 "left_leg": True, "right_leg": True, "heartbeat": True}
        await broadcast(frame)
        await asyncio.sleep(0.5)

@app.post("/simulation/start")
async def sim_start():
    global SIM_TASK
    if not SIM_TASK or SIM_TASK.done():
        SIM_TASK = asyncio.create_task(simulate())
    return {"running": True}

@app.post("/simulation/stop")
async def sim_stop():
    global SIM_TASK
    if SIM_TASK: SIM_TASK.cancel()
    return {"running": False}

# ---------- Topics CRUD (used by this dashboard) ----------
@app.get("/topics")
def get_topics():
    with DB.connect() as c:
        rows = c.execute(text("SELECT name, topic FROM topics ORDER BY name")).all()
    return [{"name": r.name, "topic": r.topic} for r in rows]

class TopicIn(BaseModel):
    topic: str

@app.put("/topics/{name}")
def put_topic(name: str, body: TopicIn):
    with DB.begin() as c:
        res = c.execute(text("UPDATE topics SET topic=:t WHERE name=:n"),
                        dict(t=body.topic, n=name))
        if res.rowcount == 0:
            raise HTTPException(404, f"Topic '{name}' not found")
    # re-subscribe with new mapping
    global TOPICS
    TOPICS = load_topics()
    mq.reconnect()
    return {"name": name, "topic": body.topic}

# ---------- WebSocket ----------
@app.websocket("/ws")
async def ws(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)`}</Code>
      </Section>

      <Section icon={Workflow} title="4. Where to edit what">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <b className="neon-text-cyan">Start / Stop logic</b> →{" "}
            <span className="font-mono">@app.post("/bike/start")</span> &{" "}
            <span className="font-mono">/bike/stop</span> in <span className="font-mono">main.py</span>.
            Change the MQTT payload or add DB logging here.
          </li>
          <li>
            <b className="neon-text-cyan">Incoming telemetry handling</b> →{" "}
            <span className="font-mono">on_message()</span>. Parse, validate, and persist new fields here.
          </li>
          <li>
            <b className="neon-text-cyan">Topic mappings</b> → MySQL <span className="font-mono">topics</span> table.
            Edit live from this dashboard's <i>MQTT Topics</i> panel (calls{" "}
            <span className="font-mono">PUT /topics/{"{name}"}</span>).
          </li>
          <li>
            <b className="neon-text-cyan">Simulation behavior</b> →{" "}
            <span className="font-mono">simulate()</span> coroutine. Tune frequency / randomness.
          </li>
          <li>
            <b className="neon-text-cyan">Dashboard API URL</b> → set{" "}
            <span className="font-mono">window.__BIKE_API__</span> or edit{" "}
            <span className="font-mono">src/lib/bike-types.ts</span> (defaults to{" "}
            <span className="font-mono">http://localhost:8000</span>).
          </li>
        </ul>
      </Section>

      <Section icon={Server} title="5. Run it">
        <Code>{`pip install fastapi uvicorn paho-mqtt sqlalchemy pymysql
# MySQL must be running and the schema applied
uvicorn main:app --host 0.0.0.0 --port 8000 --reload`}</Code>
      </Section>
    </motion.section>
  );
}
