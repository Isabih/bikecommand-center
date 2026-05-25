import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpDown,
  Check,
  Clock,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { bikeApi, type TopicConfig } from "@/lib/bike-api";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Direction = "sub" | "pub" | "both";

function relativeTime(iso: string | null): string {
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function DirectionPill({ direction }: { direction: Direction }) {
  const map = {
    sub: { Icon: ArrowDownToLine, label: "SUB", cls: "neon-text-cyan border-[oklch(0.85_0.18_200/0.4)] bg-[oklch(0.85_0.18_200/0.06)]" },
    pub: { Icon: ArrowUpFromLine, label: "PUB", cls: "neon-text-green border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.06)]" },
    both: { Icon: ArrowUpDown, label: "BOTH", cls: "text-[oklch(0.85_0.18_85)] border-[oklch(0.85_0.18_85/0.4)] bg-[oklch(0.85_0.18_85/0.06)]" },
  }[direction];
  const Icon = map.Icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-[0.18em] font-semibold", map.cls)}>
      <Icon className="h-3 w-3" /> {map.label}
    </span>
  );
}

export function TopicsEditor() {
  const [topics, setTopics] = useState<TopicConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; topic: string; direction: Direction; description: string }>({
    name: "", topic: "", direction: "sub", description: "",
  });
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [newDraft, setNewDraft] = useState<{ name: string; topic: string; direction: Direction; description: string }>({
    name: "", topic: "", direction: "sub", description: "",
  });
  const [creating, setCreating] = useState(false);

  const [, setTick] = useState(0);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await bikeApi.listTopics();
      setTopics(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Realtime: push updates to last_seen / CRUD
  useEffect(() => {
    const channel = supabase
      .channel("mqtt_topics_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "mqtt_topics" }, (payload) => {
        setTopics((prev) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as TopicConfig;
            if (prev.some((t) => t.id === row.id)) return prev;
            return [...prev, row].sort((a, b) => a.name.localeCompare(b.name));
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
      supabase.removeChannel(channel);
    };
  }, []);

  // Tick once a second to refresh "x seconds ago"
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const subscribed = useMemo(
    () => topics.filter((t) => t.direction === "sub" || t.direction === "both"),
    [topics],
  );

  const beginEdit = (t: TopicConfig) => {
    setEditingId(t.id);
    setDraft({
      name: t.name,
      topic: t.topic,
      direction: t.direction,
      description: t.description ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: string) => {
    setBusyId(id);
    try {
      await bikeApi.updateTopic(id, {
        name: draft.name.trim(),
        topic: draft.topic.trim(),
        direction: draft.direction,
        description: draft.description.trim() || null,
      });
      toast.success("Topic updated");
      setEditingId(null);
    } catch (e) {
      toast.error("Update failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t: TopicConfig) => {
    if (!confirm(`Delete topic "${t.name}" (${t.topic})?`)) return;
    setBusyId(t.id);
    try {
      await bikeApi.deleteTopic(t.id);
      toast.success(`Deleted "${t.name}"`);
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  const createNew = async () => {
    if (!newDraft.name.trim() || !newDraft.topic.trim()) {
      toast.error("Name and topic are required");
      return;
    }
    setCreating(true);
    try {
      await bikeApi.createTopic({
        name: newDraft.name.trim(),
        topic: newDraft.topic.trim(),
        description: newDraft.description.trim() || undefined,
        direction: newDraft.direction,
      });
      toast.success(`Created "${newDraft.name}"`);
      setNewDraft({ name: "", topic: "", direction: "sub", description: "" });
      setAdding(false);
    } catch (e) {
      toast.error("Create failed", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">
            MQTT Topics
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            {topics.length} bindings · {subscribed.length} subscribed · live last-seen
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          <button
            onClick={() => setAdding((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] transition-all",
              adding
                ? "border-white/10 bg-white/5 text-muted-foreground"
                : "border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.08)] neon-text-green hover:bg-[oklch(0.85_0.22_150/0.16)]",
            )}
          >
            {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {adding ? "Cancel" : "New Topic"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-[oklch(0.7_0.26_25/0.4)] bg-[oklch(0.7_0.26_25/0.06)] p-3 text-xs neon-text-red mt-3">
          {error}
        </div>
      )}

      {/* Add form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-xl border border-[oklch(0.85_0.22_150/0.3)] bg-[oklch(0.85_0.22_150/0.04)] p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                placeholder="Name (e.g. brake)"
                value={newDraft.name}
                onChange={(e) => setNewDraft({ ...newDraft, name: e.target.value })}
                className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
              />
              <input
                placeholder="Topic (e.g. bike/brake)"
                value={newDraft.topic}
                onChange={(e) => setNewDraft({ ...newDraft, topic: e.target.value })}
                className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
              />
              <select
                value={newDraft.direction}
                onChange={(e) => setNewDraft({ ...newDraft, direction: e.target.value as Direction })}
                className="bg-background border border-white/10 rounded-md px-2.5 py-1.5 text-sm outline-none"
              >
                <option value="sub">SUB (backend subscribes)</option>
                <option value="pub">PUB (backend publishes)</option>
                <option value="both">BOTH</option>
              </select>
              <input
                placeholder="Description (optional)"
                value={newDraft.description}
                onChange={(e) => setNewDraft({ ...newDraft, description: e.target.value })}
                className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
              />
              <div className="sm:col-span-2 flex justify-end">
                <button
                  onClick={createNew}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-md border border-[oklch(0.85_0.22_150/0.5)] bg-[oklch(0.85_0.22_150/0.12)] neon-text-green px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] hover:bg-[oklch(0.85_0.22_150/0.2)] disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create binding
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="space-y-2 mt-4">
        {topics.map((t) => {
          const isEditing = editingId === t.id;
          const busy = busyId === t.id;
          const fresh = t.last_seen_at && Date.now() - new Date(t.last_seen_at).getTime() < 10_000;
          return (
            <motion.div
              key={t.id}
              layout
              className={cn(
                "rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 transition-all",
                isEditing && "border-[oklch(0.85_0.18_200/0.5)] bg-[oklch(0.85_0.18_200/0.04)]",
              )}
            >
              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none focus:border-[oklch(0.85_0.18_200/0.6)]"
                  />
                  <input
                    value={draft.topic}
                    onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                    className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm font-mono outline-none focus:border-[oklch(0.85_0.18_200/0.6)]"
                  />
                  <select
                    value={draft.direction}
                    onChange={(e) => setDraft({ ...draft, direction: e.target.value as Direction })}
                    className="bg-background border border-white/10 rounded-md px-2.5 py-1.5 text-sm outline-none"
                  >
                    <option value="sub">SUB</option>
                    <option value="pub">PUB</option>
                    <option value="both">BOTH</option>
                  </select>
                  <input
                    placeholder="Description"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="bg-transparent border border-white/10 rounded-md px-2.5 py-1.5 text-sm outline-none"
                  />
                  <div className="sm:col-span-2 flex justify-end gap-1">
                    <button
                      onClick={() => saveEdit(t.id)}
                      disabled={busy}
                      className="inline-flex items-center justify-center h-8 px-3 rounded-md border border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.08)] neon-text-green hover:bg-[oklch(0.85_0.22_150/0.16)] gap-1.5 text-[11px] uppercase tracking-[0.2em]"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-shrink-0 w-28">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Name</div>
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      {t.name}
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          fresh ? "bg-[oklch(0.85_0.22_150)] shadow-[0_0_8px_oklch(0.85_0.22_150)] animate-pulse-dot" : "bg-white/15",
                        )}
                        title={fresh ? "Active" : "Idle"}
                      />
                    </div>
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Topic</div>
                    <div className="text-sm font-mono truncate text-foreground/90">{t.topic}</div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Mode</div>
                    <DirectionPill direction={t.direction} />
                  </div>
                  <div className="flex-shrink-0 min-w-[110px]">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Last Seen</div>
                    <div className={cn("text-xs flex items-center gap-1 tabular-nums", fresh ? "neon-text-green" : "text-muted-foreground")}>
                      <Clock className="h-3 w-3" />
                      {relativeTime(t.last_seen_at)}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    <button
                      onClick={() => beginEdit(t)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:border-white/20"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      onClick={() => remove(t)}
                      disabled={busy}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[oklch(0.7_0.26_25/0.35)] bg-[oklch(0.7_0.26_25/0.06)] neon-text-red hover:bg-[oklch(0.7_0.26_25/0.14)] disabled:opacity-50"
                      aria-label="Delete"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {t.last_payload && (
                    <div className="w-full mt-1 text-[10px] font-mono text-muted-foreground/80 truncate border-t border-white/5 pt-1.5">
                      <span className="uppercase tracking-[0.2em] text-muted-foreground/60 mr-2">Payload</span>
                      {t.last_payload}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        {!loading && topics.length === 0 && !adding && (
          <div className="text-xs text-muted-foreground italic py-6 text-center">
            No topics yet. Click "New Topic" to create one.
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground border-t border-white/5 pt-3">
        <Save className="h-3.5 w-3.5 mt-0.5 neon-text-cyan" />
        <span>
          Stored in Lovable Cloud (<span className="font-mono">mqtt_topics</span>). The FastAPI backend reads this table, subscribes to every <code className="font-mono neon-text-cyan">sub</code> topic, and updates <code className="font-mono">last_seen_at</code> on every received message.
        </span>
      </div>
    </motion.section>
  );
}
