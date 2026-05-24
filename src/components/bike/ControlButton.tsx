import { motion, AnimatePresence } from "framer-motion";
import { Loader2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Variant = "green" | "red" | "blue" | "gray";

interface Props {
  label: string;
  icon: LucideIcon;
  variant: Variant;
  active?: boolean;
  onAction: () => Promise<unknown>;
  successMsg: string;
}

const variantClasses: Record<Variant, { glow: string; text: string; ring: string }> = {
  green: { glow: "shadow-[0_0_24px_oklch(0.85_0.22_150/0.5)]", text: "neon-text-green", ring: "ring-[oklch(0.85_0.22_150/0.6)]" },
  red: { glow: "shadow-[0_0_24px_oklch(0.7_0.26_25/0.55)]", text: "neon-text-red", ring: "ring-[oklch(0.7_0.26_25/0.6)]" },
  blue: { glow: "shadow-[0_0_24px_oklch(0.72_0.22_250/0.5)]", text: "text-[oklch(0.78_0.18_250)]", ring: "ring-[oklch(0.72_0.22_250/0.6)]" },
  gray: { glow: "shadow-[0_0_18px_oklch(0.6_0.02_240/0.4)]", text: "text-muted-foreground", ring: "ring-[oklch(0.6_0.02_240/0.4)]" },
};

export function ControlButton({ label, icon: Icon, variant, active, onAction, successMsg }: Props) {
  const [loading, setLoading] = useState(false);
  const v = variantClasses[variant];

  const handle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onAction();
      toast.success(successMsg);
    } catch (e) {
      toast.error((e as Error).message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.97 }}
      onClick={handle}
      disabled={loading}
      className={cn(
        "relative w-full group overflow-hidden rounded-xl border border-white/10 px-5 py-4 text-left transition",
        "glass-panel hover:border-white/20",
        active && `ring-1 ${v.ring} ${v.glow}`,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 border border-white/10",
            v.text,
            active && v.glow,
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="h-5 w-5 animate-spin" />
              </motion.span>
            ) : (
              <motion.span key="i" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <Icon className="h-5 w-5" />
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        <div className="flex-1">
          <div className={cn("font-semibold tracking-wide text-sm", v.text)}>{label}</div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mt-0.5">
            {active ? "Active" : "Ready"}
          </div>
        </div>
      </div>
      {/* shimmer */}
      <span className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
    </motion.button>
  );
}
