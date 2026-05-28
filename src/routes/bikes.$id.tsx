import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  CircleDot,
  Cpu,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Loader2,
  Play,
  PlayCircle,
  Power,
  Radio,
  Settings2,
  Square,
  StopCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BikeVisual } from "@/components/bike/BikeVisual";
import { Bike3D } from "@/components/bike/Bike3D";
import { ControlButton } from "@/components/bike/ControlButton";
import { SpeedGauge } from "@/components/bike/SpeedGauge";
import { TelemetryCard } from "@/components/bike/TelemetryCard";
import { LiveTopicTable } from "@/components/bike/LiveTopicTable";
import { ModeBadge } from "@/components/bike/ModeBadge";
import { useBikeSocket } from "@/hooks/use-bike-socket";
import { bikeApi } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import type { Bike, SystemMode } from "@/lib/bike-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bikes/$id")({
  component: BikeDashboard,
  head: () => ({
    meta: [
      { title: "Bike Dashboard — IoT Control Center" },
      { name: "description", content: "Live telemetry and controls for the selected bike." },
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
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] font-medium",
        ok
          ? "neon-text-green border-[oklch(0.85_0.22_150/0.45)] bg-[oklch(0.85_0.22_150/0.06)]"
          : "neon-text-red border-[oklch(0.7_0.26_25/0.45)] bg-[oklch(0.7_0.26_25/0.06)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", ok && "animate-pulse-dot")} />
    </div>
  );
}

function BikeDashboard() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [bike, setBike] = useState<Bike | null>(null);
  const [loadingBike, setLoadingBike] = useState(true);

  useEffect(() => {
    let canceled = false;
    bikeApi
      .getBike(id)
      .then((b) => {
        if (canceled) return;
        if (!b) {
          navigate({ to: "/" });
          return;
        }
        setBike(b);
      })
      .catch(() => navigate({ to: "/" }))
      .finally(() => !canceled && setLoadingBike(false));
    return () => {
      canceled = true;
    };
  }, [id, navigate]);

  // Realtime subscription on this bike row so session_mode updates live everywhere
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`bike_row_${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bikes", filter: `id=eq.${id}` },
        (payload) => setBike(payload.new as Bike),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  const { telemetry, wsState, lastUpdate, heartbeatTick } = useBikeSocket(bike?.esp32_id);
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (heartbeatTick === 0) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 250);
    return () => clearTimeout(t);
  }, [heartbeatTick]);

  const mode: SystemMode = (bike?.session_mode as SystemMode) ?? "IDLE";
  const bikeActive = mode === "ACTIVE";
  const simActive = mode === "SIMULATION";

  const wsOk = wsState === "connected";
  const lastUpdateText = useMemo(
    () => (lastUpdate ? new Date(lastUpdate).toLocaleTimeString() : "—"),
    [lastUpdate],
  );

  if (loadingBike || !bike) {
    return (
      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin inline" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-6 space-y-6 relative">
      {/* Bike Header */}
      <motion.section
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-4"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Bikes
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold truncate">{bike.name}</h1>
            <ModeBadge mode={mode} size="sm" />
          </div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Cpu className="h-3 w-3" />
            <span className="font-mono normal-case tracking-normal">{bike.esp32_id}</span>
          </div>
        </div>
        <Link
          to="/bikes/$id/topics"
          params={{ id: bike.id }}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20"
        >
          <Settings2 className="h-3.5 w-3.5" /> Topics
        </Link>
        <StatusBadge ok={wsOk} label={wsOk ? "WiFi Online" : "WiFi Offline"} icon={wsOk ? Wifi : WifiOff} />
        <StatusBadge ok={wsOk} label={wsOk ? "MQTT Linked" : "MQTT Down"} icon={Radio} />
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              pulse ? "bg-[oklch(0.85_0.18_200)] shadow-[0_0_10px_oklch(0.85_0.18_200)]" : "bg-white/20",
            )}
          />
          Live
        </div>
      </motion.section>

      {/* Status bar */}
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
          <Activity className="h-4 w-4 neon-text-cyan" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Last Update</div>
            <div className="text-sm font-semibold tabular-nums">{lastUpdateText}</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Gauge className="h-4 w-4 neon-text-cyan" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Speed</div>
            <div className="text-sm font-semibold tabular-nums">{telemetry.speed.toFixed(1)} km/h</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Power className="h-4 w-4 neon-text-cyan" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Mode</div>
            <div className="mt-1">
              <ModeBadge mode={mode} size="sm" />
            </div>
          </div>
        </div>
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls */}
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
              await bikeApi.startBike(bike.id);
            }}
          />
          <ControlButton
            label="STOP BIKE SESSION"
            icon={Square}
            variant="red"
            successMsg="Bike session stopped"
            onAction={async () => {
              await bikeApi.stopBike(bike.id);
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
              await bikeApi.startSimulation(bike.id);
            }}
          />
          <ControlButton
            label="STOP SIMULATION"
            icon={StopCircle}
            variant="gray"
            successMsg="Simulation stopped"
            onAction={async () => {
              await bikeApi.stopSimulation(bike.id);
            }}
          />
        </motion.section>

        {/* Center */}
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
          <div className="pointer-events-none absolute inset-0 opacity-20 mix-blend-screen">
            <div
              className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-[oklch(0.85_0.18_200)] to-transparent"
              style={{ animation: "scan-line 6s linear infinite", top: 0 }}
            />
          </div>
        </motion.section>

        {/* Telemetry */}
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

      {/* Live MQTT topic activity for this bike */}
      <LiveTopicTable bikeId={bike.id} compact />

      <footer className="pt-2 pb-6 text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        Bike IoT Control Center · {new Date().getFullYear()}
      </footer>
    </main>
  );
}
