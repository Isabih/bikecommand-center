import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Copy, Filter, Radio, Search } from "lucide-react";
import { toast } from "sonner";
import { bikeApi, type TopicConfig } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type DirectionFilter = "all" | "sub" | "pub" | "both";
type ActivityFilter = "all" | "active" | "idle" | "inactive";

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

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`Copied ${label ?? "value"}`);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed");
    }
  };
  return (
    <button
      onClick={onCopy}
      className="inline-flex items-center justify-center h-6 w-6 rounded border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground hover:border-white/20 transition"
      aria-label={`Copy ${label ?? "value"}`}
      title={`Copy ${label ?? "value"}`}
    >
      {copied ? <Check className="h-3 w-3 neon-text-green" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

/**
 * Per-topic debug view: filterable table with last-received relative time,
 * last payload, and one-click copy for topic and payload.
 */
export function TopicDebugTable({ bikeId }: { bikeId?: string }) {
  const [topics, setTopics] = useState<TopicConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");

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

  useEffect(() => {
    const ch = supabase
      .channel(`topic_debug_${bikeId ?? "all"}`)
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

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics.filter((t) => {
      if (direction !== "all" && t.direction !== direction) return false;
      const ms = t.last_seen_at ? Date.now() - new Date(t.last_seen_at).getTime() : Infinity;
      const isActive = ms < 5000;
      const isIdle = !isActive && ms < 60_000;
      const isInactive = !isActive && !isIdle;
      if (activity === "active" && !isActive) return false;
      if (activity === "idle" && !isIdle) return false;
      if (activity === "inactive" && !isInactive) return false;
      if (q) {
        const hay = `${t.name} ${t.topic} ${t.description ?? ""} ${t.last_payload ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [topics, search, direction, activity]);

  const counts = useMemo(() => {
    let active = 0,
      idle = 0;
    for (const t of topics) {
      const ms = t.last_seen_at ? Date.now() - new Date(t.last_seen_at).getTime() : Infinity;
      if (ms < 5000) active++;
      else if (ms < 60_000) idle++;
    }
    return { active, idle, total: topics.length };
  }, [topics]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan flex items-center gap-2">
            <Radio className="h-4 w-4" /> Topic Debug
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            {counts.total} topics · {counts.active} active · {counts.idle} idle · filtered {filtered.length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, topic, or payload…"
            className="w-full bg-transparent border border-white/10 rounded-md pl-8 pr-2.5 py-1.5 text-sm outline-none focus:border-[oklch(0.85_0.18_200/0.6)]"
          />
        </div>
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as DirectionFilter)}
          className="bg-background border border-white/10 rounded-md px-2.5 py-1.5 text-xs uppercase tracking-[0.18em] outline-none"
        >
          <option value="all">All dirs</option>
          <option value="sub">Sub</option>
          <option value="pub">Pub</option>
          <option value="both">Both</option>
        </select>
        <select
          value={activity}
          onChange={(e) => setActivity(e.target.value as ActivityFilter)}
          className="bg-background border border-white/10 rounded-md px-2.5 py-1.5 text-xs uppercase tracking-[0.18em] outline-none"
        >
          <option value="all">Any state</option>
          <option value="active">Active</option>
          <option value="idle">Idle</option>
          <option value="inactive">Inactive</option>
        </select>
        {(search || direction !== "all" || activity !== "all") && (
          <button
            onClick={() => {
              setSearch("");
              setDirection("all");
              setActivity("all");
            }}
            className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground"
          >
            <Filter className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground italic">
          {topics.length === 0 ? "No topics yet." : "No topics match the current filters."}
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.22em] text-muted-foreground border-b border-white/5">
                <th className="px-2 py-2 w-8"></th>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Topic</th>
                <th className="px-2 py-2">Dir</th>
                <th className="px-2 py-2">Last Seen</th>
                <th className="px-2 py-2">Last Payload</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const ms = t.last_seen_at ? Date.now() - new Date(t.last_seen_at).getTime() : Infinity;
                const active = ms < 5000;
                const idle = !active && ms < 60_000;
                return (
                  <motion.tr key={t.id} layout className="border-b border-white/5 hover:bg-white/[0.02]">
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
                    <td className="px-2 py-2.5 font-mono text-xs text-foreground/85">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[200px]">{t.topic}</span>
                        <CopyButton value={t.topic} label="topic" />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      {t.direction}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2.5 text-xs tabular-nums whitespace-nowrap",
                        active ? "neon-text-green" : "text-muted-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {relative(t.last_seen_at)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[11px] text-muted-foreground/85">
                      {t.last_payload ? (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-[280px]">{t.last_payload}</span>
                          <CopyButton value={t.last_payload} label="payload" />
                        </div>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
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
