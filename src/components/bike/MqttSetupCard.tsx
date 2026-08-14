import { motion } from "framer-motion";
import { Copy, Radio, Server, Settings2, Terminal } from "lucide-react";
import { toast } from "sonner";
import { getApiBase, getWsUrl } from "@/lib/bike-types";

const INSTALL = `# macOS
brew install mosquitto
brew services start mosquitto

# Ubuntu / Debian
sudo apt update && sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

# Windows (Chocolatey)
choco install mosquitto

# Docker (alternative)
docker run -it --rm --name mqtt -p 1884:1883 \\
  eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf
`;

const BROKER_CONF = `# /etc/mosquitto/mosquitto.conf  (or mosquitto.conf on macOS/Windows)
listener 1884 0.0.0.0
allow_anonymous true
`;

const TEST_CHEATSHEET = `# 1. Watch ALL bike traffic in one terminal
mosquitto_sub -h 192.168.1.64 -p 1884 -t "bike/#" -v

# 2. In another terminal, publish telemetry the dashboard will display
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/telemetry \\
  -m '{"esp32_id":"ESP32-001","speed":42.5,"ignition":true,"brake":false,"left_indicator":true,"right_indicator":false,"left_leg":true,"right_leg":false,"heartbeat":true}'

# 3. Toggle control / simulation manually
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/control     -m '{"command":"on"}'
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/control     -m '{"command":"off"}'
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/simulation  -m '{"command":"start"}'
mosquitto_pub -h 192.168.1.64 -p 1884 -t bike/simulation  -m '{"command":"stop"}'
`;

const FRONTEND_CFG = `// src/lib/bike-types.ts — change the dashboard's backend URL here
export const API_BASE =
  (typeof window !== "undefined" &&
    (window as unknown as { __BIKE_API__?: string }).__BIKE_API__) ||
  "http://localhost:8000";           // <-- FastAPI host (HTTP)
export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";

// Or override at runtime (e.g. in index.html before the app loads):
// <script>window.__BIKE_API__ = "http://192.168.1.64:8000"</script>
`;

const BACKEND_ENV = `# FastAPI .env — change MQTT broker IP/port here
MQTT_HOST=192.168.1.64    # <-- your Mosquitto broker IP
MQTT_PORT=1884            # <-- your Mosquitto broker port
DATABASE_URL=postgresql+psycopg://postgres.<project>:<DB_PASSWORD>@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
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
      <pre className="overflow-x-auto rounded-lg border border-white/8 bg-black/40 p-3 text-[11px] leading-relaxed font-mono text-foreground/85 max-h-[360px]">
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

export function MqttSetupCard() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 space-y-5"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan flex items-center gap-2">
            <Radio className="h-4 w-4" /> MQTT Setup & Testing
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            Install Mosquitto · point the dashboard at it · publish a message · watch it light up
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] text-muted-foreground font-mono">
          <Server className="h-3.5 w-3.5 neon-text-cyan" />
          API: <span className="text-foreground">{getApiBase()}</span>
          <span className="mx-1 opacity-40">·</span>
          WS: <span className="text-foreground">{getWsUrl()}</span>
        </div>
      </div>

      <div className="rounded-lg border border-[oklch(0.85_0.18_200/0.3)] bg-[oklch(0.85_0.18_200/0.04)] p-3 text-[11px] text-foreground/85 space-y-1">
        <div className="font-semibold uppercase tracking-[0.2em] neon-text-cyan flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5" /> Where to configure the endpoint
        </div>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <b>MQTT broker IP / port</b> → FastAPI <code className="font-mono">.env</code> (
            <code className="font-mono">MQTT_HOST</code> / <code className="font-mono">MQTT_PORT</code>).
          </li>
          <li>
            <b>Dashboard → FastAPI URL</b> → <code className="font-mono">src/lib/bike-types.ts</code> (
            <code className="font-mono">API_BASE</code>), or set{" "}
            <code className="font-mono">window.__BIKE_API__</code> at runtime.
          </li>
          <li>
            <b>MQTT topic names</b> (e.g. <code className="font-mono">bike/control</code>,{" "}
            <code className="font-mono">bike/telemetry</code>) → managed live in the per-bike{" "}
            <span className="neon-text-cyan">MQTT Topics</span> screen. The FastAPI backend re-subscribes
            automatically.
          </li>
        </ul>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Terminal className="h-3 w-3" /> 1 · Install Mosquitto broker
        </div>
        <CodeBlock code={INSTALL} lang="bash" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Server className="h-3 w-3" /> 2 · Allow LAN connections on port 1884
        </div>
        <CodeBlock code={BROKER_CONF} lang="conf" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Restart mosquitto after editing: <code className="font-mono">sudo systemctl restart mosquitto</code> · macOS:{" "}
          <code className="font-mono">brew services restart mosquitto</code>.
        </p>
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
          3 · Point the dashboard at FastAPI
        </div>
        <CodeBlock code={FRONTEND_CFG} lang="ts" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2">
          4 · Point FastAPI at the broker
        </div>
        <CodeBlock code={BACKEND_ENV} lang="env" />
      </div>

      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mb-2 flex items-center gap-2">
          <Radio className="h-3 w-3" /> 5 · Publish from a terminal — the dashboard lights up instantly
        </div>
        <CodeBlock code={TEST_CHEATSHEET} lang="bash" />
        <p className="text-[10px] text-muted-foreground mt-1">
          Telemetry cards (Ignition, Brake, Indicators, Legs, Heartbeat) glow and pulse when their value goes{" "}
          <span className="neon-text-amber font-semibold">HIGH</span>. The speed gauge changes color as you cross
          50 km/h and 96 km/h. The MQTT debug table shows a green pulsing dot next to topics receiving messages.
        </p>
      </div>
    </motion.section>
  );
}
