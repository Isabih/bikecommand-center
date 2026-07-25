import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { bikeApi } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import type { Bike, FirmwareManifest, FirmwareVersionRow } from "@/lib/bike-types";
import { cn } from "@/lib/utils";

// ─── OTA phase model ──────────────────────────────────────────────────
const PHASES = ["checking", "downloading", "flashing", "verifying", "rebooting"] as const;
type Phase = (typeof PHASES)[number];
const PHASE_LABEL: Record<Phase, string> = {
  checking: "Checking",
  downloading: "Downloading",
  flashing: "Flashing",
  verifying: "Verifying",
  rebooting: "Rebooting",
};

/** Bucket a raw progress (0-100) into a phase-local (0-100) percent. */
const PHASE_BUCKETS: Record<Phase, [number, number]> = {
  checking: [0, 5],
  downloading: [5, 85],
  flashing: [85, 95],
  verifying: [95, 99],
  rebooting: [99, 100],
};

function derivePhase(state: string | null | undefined, progress: number): Phase {
  const s = (state || "").toLowerCase();
  if (/(check|request|pending)/.test(s)) return "checking";
  if (/(download|fetch)/.test(s)) return "downloading";
  if (/(install|flash|writ)/.test(s)) return "flashing";
  if (/(verify|validat)/.test(s)) return "verifying";
  if (/(reboot|restart|boot|success|complete|done)/.test(s)) return "rebooting";
  if (progress <= 0) return "checking";
  if (progress < 85) return "downloading";
  if (progress < 95) return "flashing";
  if (progress < 100) return "verifying";
  return "rebooting";
}

const IN_PROGRESS_STATES = new Set([
  "requested", "checking", "downloading", "installing",
  "flashing", "verifying", "rebooting", "pending",
]);
const ONLINE_WINDOW_MS = 120_000;

function isDeviceOnline(bike: Bike): boolean {
  if (!bike.firmware_reported_at) return false;
  return Date.now() - new Date(bike.firmware_reported_at).getTime() < ONLINE_WINDOW_MS;
}

/**
 * Smooth progress interpolator.
 * Keeps a short history of (progress, timestamp) points and extrapolates
 * a rate so the bar animates continuously between server updates instead
 * of jumping in steps. Clamps to +2% above the last observation to avoid
 * overshooting reality.
 */
function useSmoothProgress(rawProgress: number, updatedAt: string | null | undefined, active: boolean) {
  const [display, setDisplay] = useState(rawProgress);
  const historyRef = useRef<Array<{ p: number; t: number }>>([]);

  useEffect(() => {
    const t = updatedAt ? new Date(updatedAt).getTime() : Date.now();
    const hist = historyRef.current;
    if (hist.length === 0 || hist[hist.length - 1].p !== rawProgress) {
      hist.push({ p: rawProgress, t });
      if (hist.length > 4) hist.shift();
    }
    setDisplay((d) => (rawProgress < d ? rawProgress : d));
  }, [rawProgress, updatedAt]);

  useEffect(() => {
    if (!active) {
      setDisplay(rawProgress);
      return;
    }
    let raf = 0;
    const tick = () => {
      const hist = historyRef.current;
      if (hist.length >= 2) {
        const a = hist[hist.length - 2];
        const b = hist[hist.length - 1];
        const dt = b.t - a.t;
        const dp = b.p - a.p;
        if (dt > 0 && dp > 0) {
          const rate = dp / dt; // % per ms
          const elapsed = Date.now() - b.t;
          const projected = b.p + rate * elapsed;
          const cap = Math.min(100, b.p + 2); // never fake more than +2% past last obs
          setDisplay(Math.max(rawProgress, Math.min(cap, projected)));
        } else {
          setDisplay(rawProgress);
        }
      } else {
        setDisplay(rawProgress);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, rawProgress]);

  return Math.max(0, Math.min(100, display));
}

function PhaseTimeline({ phase, failed, done, phasePct }: { phase: Phase; failed: boolean; done: boolean; phasePct: number }) {
  const activeIdx = PHASES.indexOf(phase);
  return (
    <div className="flex items-center gap-1 mt-3">
      {PHASES.map((p, i) => {
        const isActive = i === activeIdx && !done && !failed;
        const isDone = done || i < activeIdx;
        const isFailed = failed && i === activeIdx;
        const fillPct = isDone ? 100 : isActive ? phasePct : 0;
        return (
          <div key={p} className="flex-1 min-w-0">
            <div
              className={cn(
                "h-1 rounded-full overflow-hidden bg-white/8",
                isFailed && "bg-[oklch(0.7_0.26_25/0.25)]",
              )}
            >
              <motion.div
                className={cn(
                  "h-full",
                  isFailed
                    ? "bg-[oklch(0.7_0.26_25)] shadow-[0_0_8px_oklch(0.7_0.26_25/0.7)]"
                    : isDone
                      ? "bg-[oklch(0.85_0.22_150)]"
                      : "bg-[oklch(0.85_0.18_200)]",
                  isActive && "shadow-[0_0_6px_oklch(0.85_0.18_200/0.6)]",
                )}
                initial={false}
                animate={{ width: `${fillPct}%` }}
                transition={{ duration: 0.35, ease: "linear" }}
              />
            </div>
            <div
              className={cn(
                "text-[8.5px] uppercase tracking-[0.18em] mt-1 truncate text-center",
                isFailed
                  ? "neon-text-red"
                  : isActive
                    ? "neon-text-cyan"
                    : isDone
                      ? "neon-text-green"
                      : "text-muted-foreground/60",
              )}
            >
              {PHASE_LABEL[p]}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const Route = createFileRoute("/firmware")({
  component: FirmwarePage,
  head: () => ({
    meta: [
      { title: "Firmware Manager — IoT Control Center" },
      { name: "description", content: "OTA firmware version status and updates for every registered bike." },
    ],
  }),
});

function compareVersions(a?: string | null, b?: string | null): number {
  if (!a || !b) return 0;
  const pa = a.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function StateBadge({ state }: { state: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    idle: { cls: "text-muted-foreground border-white/10 bg-white/5", label: "Idle" },
    requested: { cls: "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)]", label: "Requested" },
    downloading: { cls: "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] animate-pulse", label: "Downloading" },
    installing: { cls: "text-amber-300 border-amber-500/40 bg-amber-500/10 animate-pulse", label: "Installing" },
    success: { cls: "neon-text-green border-[oklch(0.85_0.22_150/0.45)] bg-[oklch(0.85_0.22_150/0.08)]", label: "Success" },
    failed: { cls: "neon-text-red border-[oklch(0.7_0.26_25/0.45)] bg-[oklch(0.7_0.26_25/0.08)]", label: "Failed" },
  };
  const s = map[state] ?? map.idle;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em]", s.cls)}>
      {s.label}
    </span>
  );
}

function VersionPicker({
  value,
  versions,
  latestVersion,
  onChange,
  className,
}: {
  value: string | null;
  versions: FirmwareVersionRow[];
  latestVersion: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const effective = value ?? latestVersion ?? "—";
  const isPinned = !!value && value !== latestVersion;
  return (
    <div className={cn("relative", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] tabular-nums transition min-w-[90px] justify-between",
          isPinned
            ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
            : "border-white/10 bg-white/5 text-foreground hover:border-white/20",
        )}
      >
        <span className="truncate">v{effective}{isPinned && " (pinned)"}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-30 mt-1 w-52 glass-panel rounded-lg border border-white/15 py-1 shadow-2xl max-h-72 overflow-auto">
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/10 flex items-center justify-between"
            >
              <span>Follow latest</span>
              {value === null && <CheckCircle2 className="h-3 w-3 neon-text-green" />}
            </button>
            <div className="h-px bg-white/8 my-1" />
            {versions.length === 0 && (
              <div className="px-3 py-2 text-[10px] text-muted-foreground">No cached versions yet.</div>
            )}
            {versions.map((v) => (
              <button
                key={v.id}
                onClick={() => { onChange(v.version); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-white/10 flex items-center justify-between tabular-nums"
              >
                <span className="flex items-center gap-1.5">
                  v{v.version}
                  {v.is_latest && <span className="text-[8.5px] neon-text-cyan uppercase tracking-widest">latest</span>}
                </span>
                {value === v.version && <CheckCircle2 className="h-3 w-3 neon-text-green" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FirmwareRow({
  bike,
  versions,
  latest,
  onUpdate,
  onPin,
  busy,
}: {
  bike: Bike;
  versions: FirmwareVersionRow[];
  latest: FirmwareManifest | null;
  onUpdate: (b: Bike, targetVersion: string | null) => void;
  onPin: (b: Bike, version: string | null) => void;
  busy: boolean;
}) {
  const current = bike.firmware_version;
  const pinned = bike.firmware_pinned_version;
  const effectiveTarget = pinned || latest?.version || null;
  const outdated = effectiveTarget && current ? compareVersions(current, effectiveTarget) !== 0 : !current;
  const upToDate = effectiveTarget && current && compareVersions(current, effectiveTarget) === 0;
  const state = (bike.firmware_state || "").toLowerCase();
  const inProgress = IN_PROGRESS_STATES.has(state);
  const rawPct = Math.max(0, Math.min(100, bike.firmware_progress || 0));
  const smoothPct = useSmoothProgress(rawPct, bike.firmware_updated_at, inProgress);
  const phase = derivePhase(bike.firmware_state, smoothPct);
  const [pStart, pEnd] = PHASE_BUCKETS[phase];
  const phasePct = Math.max(0, Math.min(100, ((smoothPct - pStart) / Math.max(1, pEnd - pStart)) * 100));
  const online = isDeviceOnline(bike);
  const failed = state === "failed";
  const done = state === "success" || rawPct >= 100;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-xl p-4 border border-white/8"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg grid place-items-center bg-white/5 border border-white/10 neon-text-cyan relative">
            <Cpu className="h-5 w-5" />
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
                online
                  ? "bg-[oklch(0.85_0.22_150)] shadow-[0_0_8px_oklch(0.85_0.22_150)] animate-pulse-dot"
                  : "bg-white/25",
              )}
              title={online ? "Online" : "Offline"}
            />
          </div>
          <div className="min-w-0">
            <Link
              to="/bikes/$id"
              params={{ id: bike.id }}
              className="text-sm font-semibold truncate hover:underline"
            >
              {bike.name}
            </Link>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-mono flex items-center gap-1.5">
              <span>{bike.esp32_id}</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[8.5px] normal-case tracking-wider",
                  online
                    ? "neon-text-green border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.06)]"
                    : "text-muted-foreground border-white/10 bg-white/5",
                )}
              >
                {online ? <Wifi className="h-2.5 w-2.5" /> : <WifiOff className="h-2.5 w-2.5" />}
                {online ? "online" : "offline"}
              </span>
            </div>
          </div>
        </div>

        <div className="text-center min-w-[100px]">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Current</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5">
            {current ?? <span className="text-muted-foreground">—</span>}
          </div>
        </div>

        <div className="text-center min-w-[110px]">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Target</div>
          <div className="mt-0.5">
            <VersionPicker
              value={pinned}
              versions={versions}
              latestVersion={latest?.version ?? null}
              onChange={(v) => onPin(bike, v)}
            />
          </div>
        </div>

        <div className="min-w-[100px]">
          <StateBadge state={bike.firmware_state || "idle"} />
          {bike.firmware_message && (
            <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[160px]" title={bike.firmware_message}>
              {bike.firmware_message}
            </div>
          )}
        </div>

        <div>
          {upToDate ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.08)] px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] neon-text-green">
              <CheckCircle2 className="h-3.5 w-3.5" /> Up to date
            </span>
          ) : (
            <button
              onClick={() => onUpdate(bike, pinned)}
              disabled={busy || !effectiveTarget}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition",
                outdated
                  ? "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] hover:bg-[oklch(0.85_0.18_200/0.15)]"
                  : "text-muted-foreground border-white/10 bg-white/5 hover:border-white/20",
                (busy || !effectiveTarget) && "opacity-60 cursor-not-allowed",
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {current && compareVersions(current, effectiveTarget || "") === 0 ? "Reflash" : "Flash"}
            </button>
          )}
        </div>
      </div>

      {inProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
            <span>{PHASE_LABEL[phase]}</span>
            <span className="tabular-nums neon-text-cyan">{smoothPct.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-[oklch(0.85_0.18_200)] to-[oklch(0.85_0.22_150)]"
              initial={false}
              animate={{ width: `${smoothPct}%` }}
              transition={{ duration: 0.25, ease: "linear" }}
            />
          </div>
          <PhaseTimeline phase={phase} failed={failed} done={done} phasePct={phasePct} />
        </div>
      )}
    </motion.div>
  );
}

function FirmwarePage() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [versions, setVersions] = useState<FirmwareVersionRow[]>([]);
  const [latest, setLatest] = useState<FirmwareManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCache = async () => {
    const [b, vs, lm] = await Promise.all([
      bikeApi.listBikes(),
      bikeApi.listAvailableFirmware().catch(() => [] as FirmwareVersionRow[]),
      bikeApi.getLatestFirmware().catch(() => null),
    ]);
    setBikes(b);
    setVersions(vs);
    if (lm) setLatest(lm);
    setLoading(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await bikeApi.refreshFirmwareCache();
      if (r.ok) toast.success(`Firmware cache updated — ${r.upserted ?? 0} version(s)`);
      else toast.error(`Refresh failed: ${r.error ?? "unknown"}`);
      await loadCache();
    } finally {
      setRefreshing(false);
    }
  };

  const prevStateRef = useRef<Record<string, { state: string; phase: Phase }>>({});

  useEffect(() => {
    loadCache();
    const chBikes = supabase
      .channel("firmware_bikes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "bikes" }, (payload) => {
        const next = payload.new as Bike;
        const prev = prevStateRef.current[next.id];
        const nextState = (next.firmware_state || "idle").toLowerCase();
        const nextPhase = derivePhase(next.firmware_state, next.firmware_progress || 0);
        if (prev && prev.state !== nextState) {
          if (nextState === "success") {
            toast.success(`${next.name}: OTA complete — now v${next.firmware_version ?? "?"}`, { duration: 6000 });
          } else if (nextState === "failed") {
            toast.error(`${next.name}: OTA failed — ${next.firmware_message ?? "unknown error"}`, { duration: 12000 });
          } else if (prev.phase !== nextPhase && IN_PROGRESS_STATES.has(nextState)) {
            toast.message(`${next.name}: ${PHASE_LABEL[nextPhase]}`, {
              description: next.firmware_message ?? undefined,
              duration: 3500,
            });
          }
        }
        prevStateRef.current[next.id] = { state: nextState, phase: nextPhase };
        setBikes((prev2) => prev2.map((b) => (b.id === next.id ? next : b)));
      })
      .subscribe();
    const chVersions = supabase
      .channel("firmware_versions_ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "firmware_versions" }, async () => {
        const [vs, lm] = await Promise.all([
          bikeApi.listAvailableFirmware().catch(() => [] as FirmwareVersionRow[]),
          bikeApi.getLatestFirmware().catch(() => null),
        ]);
        setVersions(vs);
        if (lm) setLatest(lm);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(chBikes);
      supabase.removeChannel(chVersions);
    };
  }, []);

  useEffect(() => {
    if (Object.keys(prevStateRef.current).length === 0 && bikes.length > 0) {
      const seed: Record<string, { state: string; phase: Phase }> = {};
      for (const b of bikes) {
        seed[b.id] = {
          state: (b.firmware_state || "idle").toLowerCase(),
          phase: derivePhase(b.firmware_state, b.firmware_progress || 0),
        };
      }
      prevStateRef.current = seed;
    }
  }, [bikes]);

  // Force re-render every 30s so online/offline pill (time-based) refreshes.
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(i);
  }, []);

  const stats = useMemo(() => {
    const total = bikes.length;
    let upToDate = 0, outdated = 0, unknown = 0, online = 0;
    for (const b of bikes) {
      if (isDeviceOnline(b)) online++;
      const target = b.firmware_pinned_version || latest?.version;
      if (!b.firmware_version) unknown++;
      else if (target && compareVersions(b.firmware_version, target) === 0) upToDate++;
      else outdated++;
    }
    return { total, upToDate, outdated, unknown, online };
  }, [bikes, latest]);

  const outdatedBikes = useMemo(
    () =>
      bikes.filter((b) => {
        const target = b.firmware_pinned_version || latest?.version;
        if (!target) return false;
        return !b.firmware_version || compareVersions(b.firmware_version, target) !== 0;
      }),
    [bikes, latest],
  );

  const manifestFor = (version: string | null | undefined): FirmwareManifest | null => {
    if (!version) return latest;
    const row = versions.find((v) => v.version === version);
    if (!row) return latest;
    return {
      version: row.version,
      url: row.url,
      sha256: row.sha256 ?? undefined,
      notes: row.notes ?? undefined,
      released_at: row.released_at ?? undefined,
    };
  };

  const handlePin = async (bike: Bike, version: string | null) => {
    // optimistic
    setBikes((prev) => prev.map((b) => (b.id === bike.id ? { ...b, firmware_pinned_version: version } : b)));
    try {
      await bikeApi.setBikeFirmwareTarget(bike.id, version);
      toast.success(version ? `${bike.name} pinned to v${version}` : `${bike.name} now follows latest`);
    } catch (e) {
      toast.error(`Pin failed: ${(e as Error).message}`);
    }
  };

  const handleUpdate = async (bike: Bike, targetVersion: string | null) => {
    const m = manifestFor(targetVersion);
    if (!m) return toast.error("No target version available");
    setBusyId(bike.id);
    const p = bikeApi.triggerFirmwareUpdate(bike.id, m);
    toast.promise(p, {
      loading: `Sending OTA to ${bike.name}…`,
      success: `OTA command sent — ${bike.name} → v${m.version}`,
      error: (e: Error) => e?.message || "OTA request failed",
    });
    try { await p; } catch { /* toast shown */ } finally { setBusyId(null); }
  };

  const handleUpdateAll = async () => {
    if (outdatedBikes.length === 0) return;
    for (const b of outdatedBikes) {
      const m = manifestFor(b.firmware_pinned_version);
      if (!m) continue;
      // eslint-disable-next-line no-await-in-loop
      await bikeApi.triggerFirmwareUpdate(b.id, m).catch(() => null);
    }
    toast.success(`OTA queued for ${outdatedBikes.length} bike(s)`);
  };

  return (
    <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-6 space-y-6">
      <motion.section
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-4"
      >
        <div className="h-11 w-11 rounded-xl grid place-items-center bg-white/5 border border-white/10 neon-text-cyan">
          <Rocket className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold">Firmware Manager</h1>
          <p className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            OTA · apaforme-firmware · cache refreshes hourly
          </p>
        </div>

        <div className="glass-panel rounded-lg px-3 py-2 min-w-[140px]">
          <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Latest release</div>
          <div className="text-sm font-semibold neon-text-cyan tabular-nums">
            {latest?.version ?? (loading ? "…" : "unavailable")}
          </div>
        </div>
        <div className="glass-panel rounded-lg px-3 py-2 min-w-[110px]">
          <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Cached versions</div>
          <div className="text-sm font-semibold tabular-nums">{versions.length}</div>
        </div>

        <button
          onClick={refresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20 disabled:opacity-60"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Poll GitHub
        </button>
        <button
          onClick={handleUpdateAll}
          disabled={outdatedBikes.length === 0}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition",
            outdatedBikes.length > 0
              ? "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] hover:bg-[oklch(0.85_0.18_200/0.15)]"
              : "text-muted-foreground border-white/10 bg-white/5 opacity-60 cursor-not-allowed",
          )}
        >
          <Download className="h-3.5 w-3.5" />
          Update all outdated ({outdatedBikes.length})
        </button>
      </motion.section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Total devices", value: stats.total, tone: "text-foreground" },
          { label: "Online", value: stats.online, tone: "neon-text-cyan" },
          { label: "Up to date", value: stats.upToDate, tone: "neon-text-green" },
          { label: "Outdated", value: stats.outdated, tone: "neon-text-red" },
          { label: "Unknown", value: stats.unknown, tone: "text-amber-300" },
        ].map((s) => (
          <div key={s.label} className="glass-panel rounded-xl p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{s.label}</div>
            <div className={cn("text-2xl font-semibold tabular-nums mt-1", s.tone)}>{s.value}</div>
          </div>
        ))}
      </section>

      {latest?.notes && (
        <section className="glass-panel rounded-xl p-4 border border-[oklch(0.85_0.18_200/0.25)]">
          <div className="text-[10px] uppercase tracking-[0.24em] neon-text-cyan mb-1">Release notes · v{latest.version}</div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{latest.notes}</p>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" />
          Devices — live via cloud realtime · pick any cached version to pin
        </div>
        {loading ? (
          <div className="glass-panel rounded-xl p-8 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin inline" />
          </div>
        ) : bikes.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center text-sm text-muted-foreground">
            No bikes registered yet.
          </div>
        ) : (
          bikes.map((b) => (
            <FirmwareRow
              key={b.id}
              bike={b}
              versions={versions}
              latest={latest}
              busy={busyId === b.id}
              onUpdate={handleUpdate}
              onPin={handlePin}
            />
          ))
        )}
      </section>

      <section className="glass-panel rounded-xl p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] neon-text-cyan">
          <AlertCircle className="h-3.5 w-3.5" /> How version discovery works
        </div>
        <p>
          The backend polls
          {" "}<code className="text-foreground">github.com/Isabih/apaforme-firmware/firmwares/apaforme</code>{" "}
          every hour, reads every manifest JSON, and caches it into
          {" "}<code className="text-foreground">firmware_versions</code>.
          The one referenced by <code className="text-foreground">latest.json</code> is flagged as "latest".
        </p>
        <p>
          Each device can either <b>follow latest</b> (auto-upgrade whenever a
          new release lands) or be <b>pinned</b> to a specific version — useful
          for rollbacks, staged rollouts, or A/B testing. Pinning is stored
          per-bike and reused every time you click <b>Flash</b>.
        </p>
        <p>
          Publish OTA trigger → <code className="text-foreground">bike/ota/update</code>{" "}
          · Device reports status → <code className="text-foreground">bike/ota/status</code>{" "}
          (<code>{'{"state":"downloading","progress":0-100,"version":"…"}'}</code>).
        </p>
      </section>
    </main>
  );
}
