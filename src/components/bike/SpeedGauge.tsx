import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface Props {
  speed: number;
  max?: number;
  /** Smoothing factor 0..1 — higher = snappier, lower = smoother. Default 0.12 */
  smoothing?: number;
}

export function SpeedGauge({ speed, max = 120, smoothing = 0.12 }: Props) {
  const target = Math.max(0, Math.min(speed, max));

  // Continuous rAF low-pass filter towards the latest streamed speed value.
  // This avoids the "jumpy" needle when MQTT messages arrive irregularly.
  const [display, setDisplay] = useState(target);
  const displayRef = useRef(target);
  const targetRef = useRef(target);

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      // Frame-rate independent exponential smoothing
      const alpha = 1 - Math.pow(1 - smoothing, dt * 60);
      const next = displayRef.current + (targetRef.current - displayRef.current) * alpha;
      const snapped = Math.abs(next - targetRef.current) < 0.02 ? targetRef.current : next;
      if (snapped !== displayRef.current) {
        displayRef.current = snapped;
        setDisplay(snapped);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [smoothing]);

  const clamped = display;
  const pct = clamped / max;
  // arc from -135deg to +135deg (270deg sweep)
  const angle = -135 + pct * 270;

  const size = 260;
  const r = 110;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  // 270deg arc => 0.75 of full circle
  const arcLength = circumference * 0.75;
  const dashOffset = arcLength * (1 - pct);

  // ticks
  const ticks = Array.from({ length: 13 }, (_, i) => i); // 0..120 step 10
  const intensity = pct > 0.8 ? "red" : pct > 0.5 ? "amber" : pct > 0.05 ? "cyan" : "idle";
  const glowClass =
    intensity === "red"
      ? "animate-glow-red"
      : intensity === "amber"
      ? "animate-glow-amber"
      : intensity === "cyan"
      ? "animate-glow-cyan"
      : "";

  return (
    <div className={`relative flex items-center justify-center rounded-full ${glowClass}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="overflow-visible">

        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.85 0.22 150)" />
            <stop offset="50%" stopColor="oklch(0.85 0.18 200)" />
            <stop offset="100%" stopColor="oklch(0.7 0.26 25)" />
          </linearGradient>
          <filter id="gaugeGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="oklch(1 0 0 / 0.08)"
          strokeWidth={14}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
        />
        {/* progress */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={14}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          filter="url(#gaugeGlow)"
          style={{ transition: "stroke-dashoffset 0.5s cubic-bezier(0.22,1,0.36,1)" }}
        />

        {/* ticks */}
        {ticks.map((i) => {
          const a = (-135 + (i / 12) * 270) * (Math.PI / 180);
          const x1 = cx + Math.cos(a) * (r - 22);
          const y1 = cy + Math.sin(a) * (r - 22);
          const x2 = cx + Math.cos(a) * (r - 10);
          const y2 = cy + Math.sin(a) * (r - 10);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="oklch(1 0 0 / 0.25)"
              strokeWidth={i % 3 === 0 ? 2 : 1}
            />
          );
        })}

        {/* needle */}
        <motion.g
          animate={{ rotate: angle }}
          transition={{ type: "tween", ease: "linear", duration: 0.05 }}
          style={{ originX: `${cx}px`, originY: `${cy}px` }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={cx}
            y2={cy - r + 18}
            stroke="oklch(0.85 0.18 200)"
            strokeWidth={3}
            strokeLinecap="round"
            filter="url(#gaugeGlow)"
          />
          <circle cx={cx} cy={cy} r={10} fill="oklch(0.22 0.04 252)" stroke="oklch(0.85 0.18 200)" strokeWidth={2} />
        </motion.g>
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="mt-12 text-5xl font-bold tabular-nums neon-text-cyan tracking-tight">
          {display.toFixed(1)}
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mt-1">km/h</div>
      </div>
    </div>
  );
}
