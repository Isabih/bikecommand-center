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

export function TelemetryCard({ label, value, icon: Icon, accent = "cyan", unit }: Props) {
  const display = typeof value === "boolean" ? (value ? "ON" : "OFF") : String(value);
  const isBool = typeof value === "boolean";
  const activeBool = isBool && value;

  return (
    <div className="glass-panel rounded-xl p-3 flex items-center gap-3 relative overflow-hidden">
      <div className={cn("h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center", accentMap[accent])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        <div className="flex items-baseline gap-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={display}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
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
            "h-2 w-2 rounded-full",
            activeBool ? "bg-[oklch(0.85_0.22_150)] shadow-[0_0_10px_oklch(0.85_0.22_150)] animate-pulse-dot" : "bg-white/15",
          )}
        />
      )}
    </div>
  );
}
