import { Power, PlayCircle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SystemMode } from "@/lib/bike-types";

interface Props {
  mode: SystemMode;
  size?: "sm" | "md";
  className?: string;
}

const map = {
  IDLE: {
    Icon: CircleDot,
    cls: "text-muted-foreground border-white/15 bg-white/[0.03]",
    dot: "bg-white/30",
  },
  ACTIVE: {
    Icon: Power,
    cls: "neon-text-green border-[oklch(0.85_0.22_150/0.45)] bg-[oklch(0.85_0.22_150/0.08)]",
    dot: "bg-[oklch(0.85_0.22_150)] shadow-[0_0_10px_oklch(0.85_0.22_150)] animate-pulse-dot",
  },
  SIMULATION: {
    Icon: PlayCircle,
    cls: "text-[oklch(0.78_0.18_250)] border-[oklch(0.72_0.22_250/0.45)] bg-[oklch(0.72_0.22_250/0.08)]",
    dot: "bg-[oklch(0.78_0.18_250)] shadow-[0_0_10px_oklch(0.78_0.18_250)] animate-pulse-dot",
  },
} as const;

export function ModeBadge({ mode, size = "md", className }: Props) {
  const m = map[mode];
  const Icon = m.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border font-semibold uppercase tracking-[0.22em]",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-[11px]",
        m.cls,
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {mode}
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot)} />
    </span>
  );
}
