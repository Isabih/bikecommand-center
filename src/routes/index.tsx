import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Activity,
  Bike,
  CircleDot,
  Cpu,
  Flame,
  Footprints,
  Gauge,
  Heart,
  
  Play,
  PlayCircle,
  Power,
  Radio,
  Square,
  StopCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BikeVisual } from "@/components/bike/BikeVisual";
import { ControlButton } from "@/components/bike/ControlButton";
import { SpeedGauge } from "@/components/bike/SpeedGauge";
import { TelemetryCard } from "@/components/bike/TelemetryCard";
import { useBikeSocket } from "@/hooks/use-bike-socket";
import { bikeApi } from "@/lib/bike-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Bike IoT Control Center — Real-time Telemetry Dashboard" },
      {
        name: "description",
        content:
          "Futuristic real-time IoT dashboard to control and monitor bike telemetry: speed, ignition, brakes, indicators and leg sensors over MQTT and WebSocket.",
      },
    ],
  }),
});

function StatusBadge({
  ok,
  label,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  icon: typeof Wifi;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-medium transition-all",
        ok
          ? "neon-text-green border-[oklch(0.85_0.22_150/0.45)] bg-[oklch(0.85_0.22_150/0.06)]"
          : "neon-text-red border-[oklch(0.7_0.26_25/0.45)] bg-[oklch(0.7_0.26_25/0.06)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className={cn("h-1.5 w-1.5 rounded-full", ok ? "bg-current animate-pulse-dot" : "bg-current")} />
    </div>
  );
}

function Dashboard() {
  const { telemetry, wsState, lastUpdate, heartbeatTick } = useBikeSocket();
  const [bikeActive, setBikeActive] = useState(false);
  const [simActive, setSimActive] = useState(false);

  // heartbeat flash
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (heartbeatTick === 0) return;
    setPulse(true);
    const id = setTimeout(() => setPulse(false), 250);
    return () => clearTimeout(id);
  }, [heartbeatTick]);

  const mode: "IDLE" | "ACTIVE" | "SIMULATION" = simActive
    ? "SIMULATION"
    : bikeActive
    ? "ACTIVE"
    : "IDLE";

  const wsOk = wsState === "connected";
  const mqttOk = wsOk; // backend MQTT health proxied via WS connectivity heuristic

  const lastUpdateText = useMemo(() => {
    if (!lastUpdate) return "—";
    const d = new Date(lastUpdate);
    return d.toLocaleTimeString();
  }, [lastUpdate]);

  return (
    <div className="min-h-screen relative">
      {/* subtle grid background */}
      <div className="pointer-events-none fixed inset-0 grid-bg opacity-[0.35]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.85_0.18_200/0.08),transparent_60%)]" />

      {/* HEADER */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/40 border-b border-white/5">
        <div className="mx-auto max-w-[1500px] px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="relative h-10 w-10 rounded-xl glass-panel grid place-items-center neon-text-cyan">
              <Bike className="h-5 w-5" />
              <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[oklch(0.85_0.22_150)] shadow-[0_0_10px_oklch(0.85_0.22_150)] animate-pulse-dot" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight">
                Bike <span className="neon-text-cyan">IoT</span> Control Center
              </h1>
              <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                ITS Apaforme · Telemetry v1
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <StatusBadge ok={wsOk} label={`WiFi ${wsOk ? "Online" : "Offline"}`} icon={wsOk ? Wifi : WifiOff} />
            <StatusBadge ok={mqttOk} label={`MQTT ${mqttOk ? "Linked" : "Down"}`} icon={Radio} />
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <span
                className={cn(
                  "h-2 w-2 rounded-full transition-all",
                  pulse ? "bg-[oklch(0.85_0.18_200)] shadow-[0_0_10px_oklch(0.85_0.18_200)]" : "bg-white/20",
                )}
              />
              Live
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-6 space-y-6 relative">
        {/* TOP SYSTEM STATUS BAR */}
        <motion.section
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl px-5 py-4 grid grid-cols-2 md:grid-cols-4 gap-4"
        >
          <div className="flex items-center gap-3">
            <Cpu className="h-4 w-4 neon-text-cyan" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Backend</div>
              <div className={cn("text-sm font-semibold", wsOk ? "neon-text-green" : "neon-text-red")}>
                {wsState === "connecting" ? "Connecting…" : wsOk ? "Online" : "Disconnected"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Radio className="h-4 w-4 neon-text-cyan" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">MQTT Bridge</div>
              <div className={cn("text-sm font-semibold", mqttOk ? "neon-text-green" : "neon-text-red")}>
                {mqttOk ? "Linked" : "Offline"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="h-4 w-4 neon-text-cyan" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Last Update</div>
              <div className="text-sm font-semibold tabular-nums">{lastUpdateText}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Gauge className="h-4 w-4 neon-text-cyan" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">System Mode</div>
              <div
                className={cn(
                  "text-sm font-semibold",
                  mode === "IDLE" && "text-muted-foreground",
                  mode === "ACTIVE" && "neon-text-green",
                  mode === "SIMULATION" && "text-[oklch(0.78_0.18_250)]",
                )}
              >
                {mode}
              </div>
            </div>
          </div>
        </motion.section>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT - Controls */}
          <motion.section
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3 glass-panel rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">Control</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Panel</span>
            </div>
            <ControlButton
              label="START BIKE SESSION"
              icon={Play}
              variant="green"
              active={bikeActive}
              successMsg="Bike session started"
              onAction={async () => {
                await bikeApi.startBike();
                setBikeActive(true);
              }}
            />
            <ControlButton
              label="STOP BIKE SESSION"
              icon={Square}
              variant="red"
              active={!bikeActive && !simActive ? false : false}
              successMsg="Bike session stopped"
              onAction={async () => {
                await bikeApi.stopBike();
                setBikeActive(false);
              }}
            />
            <div className="my-2 h-px bg-white/5" />
            <ControlButton
              label="START SIMULATION"
              icon={PlayCircle}
              variant="blue"
              active={simActive}
              successMsg="Simulation started"
              onAction={async () => {
                await bikeApi.startSimulation();
                setSimActive(true);
              }}
            />
            <ControlButton
              label="STOP SIMULATION"
              icon={StopCircle}
              variant="gray"
              successMsg="Simulation stopped"
              onAction={async () => {
                await bikeApi.stopSimulation();
                setSimActive(false);
              }}
            />
          </motion.section>

          {/* CENTER - Bike visual */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-6 glass-panel rounded-2xl p-5 relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">Live Bike</h2>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                <Heart className={cn("h-3.5 w-3.5", telemetry.heartbeat ? "neon-text-red" : "")} />
                Heartbeat
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    telemetry.heartbeat
                      ? "bg-[oklch(0.7_0.26_25)] shadow-[0_0_10px_oklch(0.7_0.26_25)] animate-pulse-dot"
                      : "bg-white/15",
                  )}
                />
              </div>
            </div>

            <div className="flex flex-col items-center">
              <SpeedGauge speed={telemetry.speed} />
            </div>

            <div className="mt-6">
              <BikeVisual t={telemetry} />
            </div>

            {/* scanning overlay */}
            <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-screen">
              <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.85_0.18_200)] to-transparent"
                style={{ animation: "scan-line 6s linear infinite", top: 0 }}
              />
            </div>
          </motion.section>

          {/* RIGHT - telemetry */}
          <motion.section
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3 glass-panel rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">Telemetry</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Live</span>
            </div>
            <TelemetryCard label="Speed" value={telemetry.speed.toFixed(1)} unit="km/h" icon={Gauge} accent="cyan" />
            <TelemetryCard label="Ignition" value={telemetry.ignition} icon={Power} accent="green" />
            <TelemetryCard label="Brake" value={telemetry.brake} icon={CircleDot} accent="red" />
            <TelemetryCard label="Left Indicator" value={telemetry.left_indicator} icon={Flame} accent="amber" />
            <TelemetryCard label="Right Indicator" value={telemetry.right_indicator} icon={Flame} accent="amber" />
            <TelemetryCard label="Left Leg" value={telemetry.left_leg} icon={Footprints} accent="cyan" />
            <TelemetryCard label="Right Leg" value={telemetry.right_leg} icon={Footprints} accent="cyan" />
            <TelemetryCard label="Heartbeat" value={telemetry.heartbeat} icon={Heart} accent="red" />
          </motion.section>
        </div>

        <footer className="pt-2 pb-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          Bike IoT Control Center · {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}
