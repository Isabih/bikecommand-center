import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Cpu,
  Eye,
  Flame,
  Orbit,
  Power,
  Camera,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Bike3D, type CameraPreset } from "@/components/bike/Bike3D";
import { SpeedGauge } from "@/components/bike/SpeedGauge";
import { ModeBadge } from "@/components/bike/ModeBadge";
import { useBikeSocket } from "@/hooks/use-bike-socket";
import { bikeApi } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import type { Bike, SystemMode } from "@/lib/bike-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bikes/$id/kiosk")({
  component: KioskView,
  head: () => ({
    meta: [
      { title: "Kiosk Mode — Nova Bike Digital Twin" },
      { name: "description", content: "Full-screen live motorcycle digital twin." },
    ],
  }),
});


function StatusChip({
  ok,
  icon: Icon,
  label,
}: {
  ok: boolean;
  icon: typeof Wifi;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] backdrop-blur",
        ok
          ? "neon-text-green border-[oklch(0.85_0.22_150/0.45)] bg-[oklch(0.85_0.22_150/0.08)]"
          : "neon-text-red border-[oklch(0.7_0.26_25/0.45)] bg-[oklch(0.7_0.26_25/0.08)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </div>
  );
}

function MiniLight({
  active,
  color,
  icon: Icon,
  label,
  pulse,
}: {
  active: boolean;
  color: "amber" | "green" | "red" | "cyan";
  icon: typeof Flame;
  label: string;
  pulse?: boolean;
}) {
  const map = {
    amber: "neon-text-amber border-[oklch(0.82_0.18_75/0.55)] shadow-[0_0_22px_oklch(0.82_0.18_75/0.5)]",
    green: "neon-text-green border-[oklch(0.85_0.22_150/0.5)] shadow-[0_0_20px_oklch(0.85_0.22_150/0.45)]",
    red: "neon-text-red border-[oklch(0.7_0.26_25/0.55)] shadow-[0_0_20px_oklch(0.7_0.26_25/0.5)]",
    cyan: "neon-text-cyan border-[oklch(0.85_0.18_200/0.5)] shadow-[0_0_20px_oklch(0.85_0.18_200/0.45)]",
  } as const;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-black/40 backdrop-blur px-3 py-2 text-[11px] uppercase tracking-[0.22em] transition-all",
        active ? map[color] : "border-white/10 text-muted-foreground",
        active && pulse && "animate-pulse-dot",
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}

const CAM_PRESETS: { id: CameraPreset; label: string; icon: typeof Eye }[] = [
  { id: "front", label: "Front", icon: Eye },
  { id: "angled", label: "Angled", icon: Camera },
  { id: "orbit", label: "Orbit", icon: Orbit },
];

function KioskView() {
  const { id } = Route.useParams();
  const [bike, setBike] = useState<Bike | null>(null);
  const [cam, setCam] = useState<CameraPreset>("angled");

  useEffect(() => {
    let cancel = false;
    bikeApi.getBike(id).then((b) => !cancel && setBike(b));
    return () => {
      cancel = true;
    };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`kiosk_bike_${id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bikes", filter: `id=eq.${id}` },
        (p) => setBike(p.new as Bike),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id]);

  const { telemetry, wsState } = useBikeSocket(bike?.esp32_id);
  const mode: SystemMode = (bike?.session_mode as SystemMode) ?? "IDLE";
  const wsOk = wsState === "connected";

  return (
    <div className="fixed inset-0 bg-black text-foreground overflow-hidden">
      {/* 3D fills the entire screen */}
      <Bike3D t={telemetry} mode={mode} variant="fill" cinematic hideHud cameraPreset={cam} />

      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 p-5 flex items-center justify-between z-10 pointer-events-none">
        <Link
          to="/bikes/$id"
          params={{ id }}
          className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/50 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Exit Kiosk
        </Link>
        <div className="flex items-center gap-2">
          {/* Camera preset switcher */}
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/15 bg-black/50 backdrop-blur p-1">
            {CAM_PRESETS.map((p) => {
              const Icon = p.icon;
              const active = cam === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setCam(p.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em] transition-all",
                    active
                      ? "neon-text-cyan bg-[oklch(0.85_0.18_200/0.12)] border border-[oklch(0.85_0.18_200/0.5)]"
                      : "text-muted-foreground hover:text-foreground border border-transparent",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="rounded-full border border-white/15 bg-black/50 backdrop-blur px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 neon-text-cyan" />
            <span className="font-mono normal-case tracking-normal">{bike?.esp32_id ?? "—"}</span>
          </div>
          <StatusChip ok={wsOk} icon={wsOk ? Wifi : WifiOff} label={wsOk ? "Connected" : "Offline"} />
          <ModeBadge mode={mode} size="sm" />
        </div>
      </div>


      {/* Left turn indicator (large arrow flasher) */}
      <div
        className={cn(
          "absolute left-6 top-1/2 -translate-y-1/2 z-10 transition-opacity duration-150",
          telemetry.left_indicator ? "opacity-100 animate-pulse" : "opacity-15",
        )}
      >
        <ChevronLeft className="h-24 w-24 neon-text-amber drop-shadow-[0_0_30px_oklch(0.82_0.18_75/0.7)]" />
      </div>
      <div
        className={cn(
          "absolute right-6 top-1/2 -translate-y-1/2 z-10 transition-opacity duration-150",
          telemetry.right_indicator ? "opacity-100 animate-pulse" : "opacity-15",
        )}
      >
        <ChevronRight className="h-24 w-24 neon-text-amber drop-shadow-[0_0_30px_oklch(0.82_0.18_75/0.7)]" />
      </div>

      {/* Bottom: speed gauge + minimal status lights */}
      <div className="absolute bottom-0 inset-x-0 p-6 z-10 flex flex-col items-center gap-4 pointer-events-none">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <MiniLight active={telemetry.ignition} color="green" icon={Power} label="Ignition" />
          <MiniLight active={telemetry.brake} color="red" icon={CircleDot} label="Brake" pulse />
          <MiniLight active={telemetry.left_leg} color="cyan" icon={Footprints} label="L-Leg" />
          <MiniLight active={telemetry.right_leg} color="cyan" icon={Footprints} label="R-Leg" />
        </div>
        <div className="rounded-2xl bg-black/55 backdrop-blur-md border border-white/10 px-6 py-4 shadow-[0_0_60px_oklch(0.85_0.18_200/0.15)]">
          <SpeedGauge speed={telemetry.speed} />
        </div>
      </div>

      {mode === "IDLE" && (
        <div className="absolute inset-0 z-20 pointer-events-none flex items-center justify-center">
          <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground border border-white/15 bg-black/60 backdrop-blur px-6 py-3 rounded-full">
            Session idle — press Start on the dashboard
          </div>
        </div>
      )}
    </div>
  );
}
