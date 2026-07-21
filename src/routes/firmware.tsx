import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Download,
  Loader2,
  RefreshCw,
  Rocket,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { bikeApi } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import type { Bike, FirmwareManifest } from "@/lib/bike-types";
import { cn } from "@/lib/utils";

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

function FirmwareRow({
  bike,
  latest,
  onUpdate,
  busy,
}: {
  bike: Bike;
  latest: FirmwareManifest | null;
  onUpdate: (b: Bike) => void;
  busy: boolean;
}) {
  const current = bike.firmware_version;
  const target = latest?.version;
  const outdated = target && current ? compareVersions(current, target) < 0 : !current;
  const upToDate = target && current && compareVersions(current, target) >= 0;
  const inProgress = ["requested", "downloading", "installing"].includes(bike.firmware_state);
  const pct = Math.max(0, Math.min(100, bike.firmware_progress || 0));

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-xl p-4 border border-white/8"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-10 w-10 rounded-lg grid place-items-center bg-white/5 border border-white/10 neon-text-cyan">
            <Cpu className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <Link
              to="/bikes/$id"
              params={{ id: bike.id }}
              className="text-sm font-semibold truncate hover:underline"
            >
              {bike.name}
            </Link>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-mono">
              {bike.esp32_id}
            </div>
          </div>
        </div>

        <div className="text-center min-w-[110px]">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Current</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5">
            {current ?? <span className="text-muted-foreground">—</span>}
          </div>
        </div>

        <div className="text-center min-w-[110px]">
          <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Available</div>
          <div className="text-sm font-semibold tabular-nums mt-0.5 neon-text-cyan">
            {target ?? "…"}
          </div>
        </div>

        <div className="min-w-[110px]">
          <StateBadge state={bike.firmware_state || "idle"} />
          {bike.firmware_message && (
            <div className="text-[10px] text-muted-foreground mt-1 truncate max-w-[160px]">
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
              onClick={() => onUpdate(bike)}
              disabled={busy || !latest}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition",
                outdated
                  ? "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] hover:bg-[oklch(0.85_0.18_200/0.15)]"
                  : "text-muted-foreground border-white/10 bg-white/5 hover:border-white/20",
                (busy || !latest) && "opacity-60 cursor-not-allowed",
              )}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {outdated ? "Update" : "Reflash"}
            </button>
          )}
        </div>
      </div>

      {inProgress && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
            <span>{bike.firmware_state}</span>
            <span className="tabular-nums neon-text-cyan">{pct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full bg-gradient-to-r from-[oklch(0.85_0.18_200)] to-[oklch(0.85_0.22_150)]"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
}

function FirmwarePage() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [latest, setLatest] = useState<FirmwareManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const [b, m] = await Promise.all([
        bikeApi.listBikes(),
        bikeApi.getLatestFirmware().catch((e) => {
          if (!silent) toast.error(`Manifest unreachable: ${(e as Error).message}`);
          return null;
        }),
      ]);
      setBikes(b);
      if (m) setLatest(m);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    refresh(true);
    const ch = supabase
      .channel("firmware_bikes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bikes" },
        (payload) => {
          setBikes((prev) => prev.map((b) => (b.id === (payload.new as Bike).id ? (payload.new as Bike) : b)));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
     
  }, []);

  const stats = useMemo(() => {
    const total = bikes.length;
    let upToDate = 0;
    let outdated = 0;
    let unknown = 0;
    for (const b of bikes) {
      if (!b.firmware_version) unknown++;
      else if (latest && compareVersions(b.firmware_version, latest.version) >= 0) upToDate++;
      else outdated++;
    }
    return { total, upToDate, outdated, unknown };
  }, [bikes, latest]);

  const outdatedBikes = useMemo(
    () => bikes.filter((b) => !b.firmware_version || (latest && compareVersions(b.firmware_version, latest.version) < 0)),
    [bikes, latest],
  );

  const handleUpdate = async (bike: Bike) => {
    if (!latest) return;
    setBusyId(bike.id);
    const p = bikeApi.triggerFirmwareUpdate(bike.id, latest);
    toast.promise(p, {
      loading: `Sending OTA to ${bike.name}…`,
      success: `OTA command sent — ${bike.name} downloading v${latest.version}`,
      error: (e: Error) => e?.message || "OTA request failed",
    });
    try {
      await p;
    } catch {
      /* toast shown */
    } finally {
      setBusyId(null);
    }
  };

  const handleUpdateAll = async () => {
    if (!latest || outdatedBikes.length === 0) return;
    for (const b of outdatedBikes) {
      // Fire sequentially so backend serializes MQTT publishes
      // eslint-disable-next-line no-await-in-loop
      await bikeApi.triggerFirmwareUpdate(b.id, latest).catch(() => null);
    }
    toast.success(`OTA queued for ${outdatedBikes.length} bike(s)`);
  };

  return (
    <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-6 space-y-6">
      {/* Header */}
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
            OTA · apaforme-firmware
          </p>
        </div>

        <div className="glass-panel rounded-lg px-3 py-2 min-w-[140px]">
          <div className="text-[9px] uppercase tracking-[0.24em] text-muted-foreground">Latest release</div>
          <div className="text-sm font-semibold neon-text-cyan tabular-nums">
            {latest?.version ?? (loading ? "…" : "unavailable")}
          </div>
        </div>

        <button
          onClick={() => refresh()}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Refresh
        </button>
        <button
          onClick={handleUpdateAll}
          disabled={!latest || outdatedBikes.length === 0}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] uppercase tracking-[0.2em] transition",
            outdatedBikes.length > 0 && latest
              ? "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.08)] hover:bg-[oklch(0.85_0.18_200/0.15)]"
              : "text-muted-foreground border-white/10 bg-white/5 opacity-60 cursor-not-allowed",
          )}
        >
          <Download className="h-3.5 w-3.5" />
          Update all outdated ({outdatedBikes.length})
        </button>
      </motion.section>

      {/* Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total devices", value: stats.total, tone: "text-foreground" },
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

      {/* Release notes */}
      {latest?.notes && (
        <section className="glass-panel rounded-xl p-4 border border-[oklch(0.85_0.18_200/0.25)]">
          <div className="text-[10px] uppercase tracking-[0.24em] neon-text-cyan mb-1">Release notes · v{latest.version}</div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap">{latest.notes}</p>
        </section>
      )}

      {/* Bike list */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <Wifi className="h-3.5 w-3.5" />
          Devices — live via cloud realtime
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
            <FirmwareRow key={b.id} bike={b} latest={latest} busy={busyId === b.id} onUpdate={handleUpdate} />
          ))
        )}
      </section>

      {/* MQTT contract help */}
      <section className="glass-panel rounded-xl p-4 text-xs text-muted-foreground space-y-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] neon-text-cyan">
          <AlertCircle className="h-3.5 w-3.5" /> Firmware MQTT contract
        </div>
        <p>
          Publish OTA trigger → <code className="text-foreground">bike/ota/update</code> ·
          Payload: <code className="text-foreground">{'{"command":"update","version":"3.3.0","url":"…"}'}</code>
        </p>
        <p>
          Device reports status → <code className="text-foreground">bike/ota/status</code> ·
          Payload: <code className="text-foreground">{'{"esp32_id":"…","state":"downloading|installing|success|failed","progress":0-100,"version":"…","message":"…"}'}</code>
        </p>
        <p>
          On boot the device should also publish its current version to
          <code className="text-foreground"> bike/ota/status </code>
          with <code className="text-foreground">{'{"state":"idle","version":"3.3.0"}'}</code>.
        </p>
      </section>
    </main>
  );
}
