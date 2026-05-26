import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Activity, Clock, Radio } from "lucide-react";
import { bikeApi, type TopicConfig } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

function relative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Live debug table for MQTT topics. Shows subscribed topics, last received timestamp,
 * the last payload, and an animated active/inactive indicator based on recent activity.
 */
export function LiveTopicTable({ bikeId, compact }: { bikeId?: string; compact?: boolean }) {
  const [topics, setTopics] = useState<TopicConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    bikeApi
      .listTopics(bikeId)
      .then((rows) => !canceled && setTopics(rows))
      .finally(() => !canceled && setLoading(false));
    return () => {
      canceled = true;
    };
  }, [bikeId]);

  // Realtime updates
  useEffect(() => {
    const ch = supabase
      .channel(`live_topics_${bikeId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mqtt_topics" }, (payload) => {
        setTopics((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as TopicConfig;
            if (bikeId && row.bike_id !== bikeId) return prev;
            if (prev.some((t) => t.id === row.id)) return prev;
            return [...prev, row];
          }
          if (payload.eventType === "UPDATE") {
            const row = payload.new as TopicConfig;
            return prev.map((t) => (t.id === row.id ? row : t));
          }
          if (payload.eventType === "DELETE") {
            const row = payload.old as { id: string };
            return prev.filter((t) => t.id !== row.id);
          }
          return prev;
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [bikeId]);

  // Refresh "x seconds ago"
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const subscribed = useMemo(
    () => topics.filter((t) => t.direction === "sub" || t.direction === "both"),
    [topics],
  );
  const activeCount = useMemo(
    () =>
      subscribed.filter(
        (t) => t.last_seen_at && Date.now() - new Date(t.last_seen_at).getTime() < 5000,
      ).length,
    [subscribed],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan flex items-center gap-2">
            <Radio className="h-4 w-4" /> Live MQTT Debug
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            {subscribed.length} subscribed · {activeCount} active now
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Realtime
          <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.85_0.18_200)] shadow-[0_0_8px_oklch(0.85_0.18_200)] animate-pulse-dot" />
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : subscribed.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground italic">
          No subscribed topics for this bike yet.
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-muted-foreground border-b border-white/5">
                <th className="px-2 py-2 w-8"></th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Topic</th>
                <th className="px-2 py-2">Last Seen</th>
                {!compact && <th className="px-2 py-2">Last Payload</th>}
              </tr>
            </thead>
            <tbody>
              {subscribed.map((t) => {
                const ms = t.last_seen_at ? Date.now() - new Date(t.last_seen_at).getTime() : Infinity;
                const active = ms < 5000;
                const idle = !active && ms < 60_000;
                return (
                  <motion.tr
                    key={t.id}
                    layout
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                  >
                    <td className="px-2 py-2.5">
                      <span
                        className={cn(
                          "inline-block h-2.5 w-2.5 rounded-full",
                          active
                            ? "bg-[oklch(0.85_0.22_150)] shadow-[0_0_10px_oklch(0.85_0.22_150)] animate-pulse-dot"
                            : idle
                            ? "bg-[oklch(0.85_0.18_85)]/70"
                            : "bg-white/15",
                        )}
                        title={active ? "Active" : idle ? "Idle" : "Inactive"}
                      />
                    </td>
                    <td className="px-2 py-2.5 font-semibold whitespace-nowrap">{t.name}</td>
                    <td className="px-2 py-2.5 font-mono text-xs text-foreground/85 truncate max-w-[200px]">
                      {t.topic}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2.5 text-xs tabular-nums whitespace-nowrap flex items-center gap-1",
                        active ? "neon-text-green" : "text-muted-foreground",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {relative(t.last_seen_at)}
                    </td>
                    {!compact && (
                      <td className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground/80 truncate max-w-[260px]">
                        {t.last_payload ?? "—"}
                      </td>
                    )}
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </motion.section>
  );
}
