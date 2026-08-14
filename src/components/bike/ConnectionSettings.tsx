import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Plug, RefreshCw, Save, Server, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { getWsUrl, useRuntimeConfig, setConfig, DEFAULT_CONFIG } from "@/lib/runtime-config";
import { cn } from "@/lib/utils";

interface Health {
  status?: string;
  broker?: string;
  connected?: boolean;
  subscribed?: string[];
}

/**
 * Live connection settings: FastAPI bridge URL + Mosquitto broker IP/port.
 * Saving persists locally and (best-effort) tells the bridge to reconnect
 * to the new broker via POST /config/mqtt.
 */
export function ConnectionSettings() {
  const cfg = useRuntimeConfig();
  const [apiBase, setApiBase] = useState(cfg.apiBase);
  const [mqttHost, setMqttHost] = useState(cfg.mqttHost);
  const [mqttPort, setMqttPort] = useState(String(cfg.mqttPort));
  const [saving, setSaving] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [probing, setProbing] = useState(false);

  useEffect(() => {
    setApiBase(cfg.apiBase);
    setMqttHost(cfg.mqttHost);
    setMqttPort(String(cfg.mqttPort));
  }, [cfg]);

  const probe = async (base = cfg.apiBase) => {
    setProbing(true);
    try {
      const res = await fetch(`${base}/health`, { cache: "no-store" });
      setHealth((await res.json()) as Health);
    } catch {
      setHealth(null);
    } finally {
      setProbing(false);
    }
  };

  useEffect(() => {
    void probe(cfg.apiBase);
    const id = window.setInterval(() => void probe(cfg.apiBase), 15_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.apiBase]);

  const save = async () => {
    const port = Number(mqttPort);
    if (!/^https?:\/\//.test(apiBase)) return toast.error("API URL must start with http:// or https://");
    if (!mqttHost.trim()) return toast.error("Enter the broker IP or hostname");
    if (!Number.isInteger(port) || port < 1 || port > 65535) return toast.error("Invalid broker port");

    setSaving(true);
    const next = setConfig({ apiBase, mqttHost: mqttHost.trim(), mqttPort: port });
    try {
      const res = await fetch(`${next.apiBase}/config/mqtt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: next.mqttHost, port: next.mqttPort }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`Bridge reconnecting to ${next.mqttHost}:${next.mqttPort}`);
    } catch {
      toast.warning("Saved locally — bridge unreachable, set MQTT_HOST in its .env instead");
    } finally {
      setSaving(false);
      void probe(next.apiBase);
    }
  };

  const online = Boolean(health);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 space-y-4"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan flex items-center gap-2">
            <Plug className="h-4 w-4" /> Connection Settings
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            Point the dashboard at your bridge and broker — applied instantly, no rebuild
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] font-mono",
            online
              ? "border-[oklch(0.85_0.22_150/0.35)] bg-[oklch(0.85_0.22_150/0.06)] neon-text-green"
              : "border-[oklch(0.7_0.26_25/0.35)] bg-[oklch(0.7_0.26_25/0.06)] neon-text-red",
          )}
        >
          {probing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : online ? (
            <Wifi className="h-3.5 w-3.5" />
          ) : (
            <WifiOff className="h-3.5 w-3.5" />
          )}
          {online ? `Bridge online · broker ${health?.broker ?? "—"}` : "Bridge offline"}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          label="MQTT Broker IP / host"
          value={mqttHost}
          onChange={setMqttHost}
          placeholder={DEFAULT_CONFIG.mqttHost}
        />
        <Field label="MQTT Port" value={mqttPort} onChange={setMqttPort} placeholder="1884" />
        <Field label="FastAPI Bridge URL" value={apiBase} onChange={setApiBase} placeholder={DEFAULT_CONFIG.apiBase} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] neon-text-cyan hover:bg-[oklch(0.85_0.18_200/0.16)] transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save & Reconnect
        </button>
        <button
          onClick={() => void probe()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", probing && "animate-spin")} /> Test
        </button>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          <Server className="h-3 w-3" /> WS: <span className="text-foreground/80">{getWsUrl()}</span>
        </div>
      </div>

      {health?.subscribed?.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Subscribed:</span>
          {health.subscribed.map((t) => (
            <span
              key={t}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-mono text-foreground/80"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </motion.section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-[12px] font-mono text-foreground outline-none focus:border-[oklch(0.85_0.18_200/0.5)]"
      />
    </label>
  );
}
