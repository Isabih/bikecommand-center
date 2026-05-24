import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Flame, CircleDot, Power, Footprints } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BikeTelemetry } from "@/lib/bike-types";

interface Props {
  t: BikeTelemetry;
}

function StatusPill({
  label,
  active,
  color,
  icon: Icon,
  pulse,
}: {
  label: string;
  active: boolean;
  color: "green" | "red" | "amber" | "cyan";
  icon: typeof Flame;
  pulse?: boolean;
}) {
  const colorMap = {
    green: "neon-text-green border-[oklch(0.85_0.22_150/0.5)] shadow-[0_0_18px_oklch(0.85_0.22_150/0.4)]",
    red: "neon-text-red border-[oklch(0.7_0.26_25/0.5)] shadow-[0_0_18px_oklch(0.7_0.26_25/0.45)]",
    amber: "neon-text-amber border-[oklch(0.82_0.18_75/0.5)] shadow-[0_0_18px_oklch(0.82_0.18_75/0.45)]",
    cyan: "neon-text-cyan border-[oklch(0.85_0.18_200/0.5)] shadow-[0_0_18px_oklch(0.85_0.18_200/0.4)]",
  };
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.18em] font-medium transition-all",
        active ? colorMap[color] : "border-white/10 text-muted-foreground",
        active && pulse && "animate-pulse-dot",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <span className={cn("ml-auto h-1.5 w-1.5 rounded-full", active ? "bg-current" : "bg-white/20")} />
    </div>
  );
}

export function BikeVisual({ t }: Props) {
  return (
    <div className="relative">
      {/* indicators row */}
      <div className="flex items-center justify-between mb-4">
        <motion.div
          animate={t.left_indicator ? { opacity: [1, 0.2, 1] } : { opacity: 0.2 }}
          transition={{ duration: 0.6, repeat: t.left_indicator ? Infinity : 0 }}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 border",
            t.left_indicator
              ? "neon-text-amber border-[oklch(0.82_0.18_75/0.6)] shadow-[0_0_24px_oklch(0.82_0.18_75/0.55)]"
              : "border-white/10 text-muted-foreground",
          )}
        >
          <ChevronLeft className="h-5 w-5" />
          <ChevronLeft className="h-5 w-5 -ml-3" />
        </motion.div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {t.esp32_id}
        </div>
        <motion.div
          animate={t.right_indicator ? { opacity: [1, 0.2, 1] } : { opacity: 0.2 }}
          transition={{ duration: 0.6, repeat: t.right_indicator ? Infinity : 0 }}
          className={cn(
            "flex items-center gap-1 rounded-lg px-3 py-2 border",
            t.right_indicator
              ? "neon-text-amber border-[oklch(0.82_0.18_75/0.6)] shadow-[0_0_24px_oklch(0.82_0.18_75/0.55)]"
              : "border-white/10 text-muted-foreground",
          )}
        >
          <ChevronRight className="h-5 w-5 -mr-3" />
          <ChevronRight className="h-5 w-5" />
        </motion.div>
      </div>

      {/* status grid */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <StatusPill label="Engine" active={t.ignition} color="green" icon={Flame} />
        <StatusPill label="Brake" active={t.brake} color="red" icon={CircleDot} pulse />
        <StatusPill label="Left Leg" active={t.left_leg} color="cyan" icon={Footprints} />
        <StatusPill label="Right Leg" active={t.right_leg} color="cyan" icon={Footprints} />
      </div>

      {/* ignition toggle visual */}
      <div className="glass-panel rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Power className={cn("h-5 w-5", t.ignition ? "neon-text-green" : "text-muted-foreground")} />
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Ignition</div>
            <div className={cn("text-sm font-semibold", t.ignition ? "neon-text-green" : "text-muted-foreground")}>
              {t.ignition ? "ENGAGED" : "STANDBY"}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "relative h-7 w-14 rounded-full border transition-colors",
            t.ignition
              ? "bg-[oklch(0.85_0.22_150/0.25)] border-[oklch(0.85_0.22_150/0.6)] shadow-[0_0_18px_oklch(0.85_0.22_150/0.45)]"
              : "bg-white/5 border-white/15",
          )}
        >
          <motion.div
            animate={{ x: t.ignition ? 28 : 2 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className={cn(
              "absolute top-1 h-5 w-5 rounded-full",
              t.ignition ? "bg-[oklch(0.85_0.22_150)]" : "bg-white/40",
            )}
          />
        </div>
      </div>
    </div>
  );
}
