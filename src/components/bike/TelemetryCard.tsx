import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string | number | boolean;
  icon: LucideIcon;
  accent?: "cyan" | "green" | "red" | "amber" | "blue";
  unit?: string;
}

const accentMap = {
  cyan: "neon-text-cyan",
  green: "neon-text-green",
  red: "neon-text-red",
  amber: "neon-text-amber",
  blue: "text-[oklch(0.78_0.18_250)]",
};

const glowMap = {
  cyan: "animate-glow-cyan border-[oklch(0.85_0.18_200/0.55)]",
  green: "animate-glow-green border-[oklch(0.85_0.22_150/0.55)]",
  red: "animate-glow-red border-[oklch(0.7_0.26_25/0.6)]",
  amber: "animate-glow-amber border-[oklch(0.82_0.18_75/0.55)]",
  blue: "animate-glow-cyan border-[oklch(0.72_0.22_250/0.55)]",
};

const dotMap = {
  cyan: "bg-[oklch(0.85_0.18_200)] shadow-[0_0_12px_oklch(0.85_0.18_200)]",
  green: "bg-[oklch(0.85_0.22_150)] shadow-[0_0_12px_oklch(0.85_0.22_150)]",
  red: "bg-[oklch(0.7_0.26_25)] shadow-[0_0_12px_oklch(0.7_0.26_25)]",
  amber: "bg-[oklch(0.82_0.18_75)] shadow-[0_0_12px_oklch(0.82_0.18_75)]",
  blue: "bg-[oklch(0.72_0.22_250)] shadow-[0_0_12px_oklch(0.72_0.22_250)]",
};

export function TelemetryCard({ label, value, icon: Icon, accent = "cyan", unit }: Props) {
  const display = typeof value === "boolean" ? (value ? "ON" : "OFF") : String(value);
  const isBool = typeof value === "boolean";
  const activeBool = isBool && value;

  return (
    <div
      className={cn(
        "glass-panel rounded-xl p-3 flex items-center gap-3 relative overflow-hidden transition-all",
        activeBool && glowMap[accent],
      )}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center",
          accentMap[accent],
          activeBool && "animate-flicker",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="flex items-baseline gap-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={display}
              initial={{ y: 8, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "text-lg font-semibold tabular-nums",
                isBool ? (activeBool ? accentMap[accent] : "text-muted-foreground") : accentMap[accent],
              )}
            >
              {display}
            </motion.div>
          </AnimatePresence>
          {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
        </div>
      </div>
      {isBool && (
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            activeBool ? cn(dotMap[accent], "animate-pulse-dot") : "bg-white/15",
          )}
        />
      )}
      {activeBool && (
        <span className="absolute top-1 right-2 text-[9px] uppercase tracking-[0.25em] font-semibold neon-text-amber animate-flicker">
          HIGH
        </span>
      )}
    </div>
  );
}
