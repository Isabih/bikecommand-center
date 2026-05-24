import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, Pencil, RefreshCw, Save, X } from "lucide-react";
import { toast } from "sonner";
import { bikeApi, type TopicConfig } from "@/lib/bike-api";
import { cn } from "@/lib/utils";

export function TopicsEditor() {
  const [topics, setTopics] = useState<TopicConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingName, setSavingName] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await bikeApi.getTopics();
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

  const beginEdit = (t: TopicConfig) => {
    setEditing(t.name);
    setDraft(t.topic);
  };

  const cancel = () => {
    setEditing(null);
    setDraft("");
  };

  const save = async (name: string) => {
    setSavingName(name);
    try {
      await bikeApi.updateTopic(name, draft);
      setTopics((prev) => prev.map((t) => (t.name === name ? { ...t, topic: draft } : t)));
      toast.success(`Topic "${name}" updated`);
      cancel();
    } catch (e) {
      toast.error(`Failed to update ${name}`, { description: (e as Error).message });
    } finally {
      setSavingName(null);
    }
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-[0.25em] neon-text-cyan">
            MQTT Topics
          </h2>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
            Edit broker topic bindings · live PUT /topics
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20 transition-all disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-[oklch(0.7_0.26_25/0.4)] bg-[oklch(0.7_0.26_25/0.06)] p-3 text-xs neon-text-red mb-3">
          Unable to fetch topics: {error}
        </div>
      )}

      {!error && topics.length === 0 && !loading && (
        <div className="text-xs text-muted-foreground italic py-6 text-center">
          No topics returned by backend.
        </div>
      )}

      <div className="space-y-2">
        {topics.map((t) => {
          const isEditing = editing === t.name;
          const isSaving = savingName === t.name;
          return (
            <div
              key={t.name}
              className={cn(
                "rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 flex items-center gap-3 transition-all",
                isEditing && "border-[oklch(0.85_0.18_200/0.5)] bg-[oklch(0.85_0.18_200/0.04)]",
              )}
            >
              <div className="flex-shrink-0 w-32 sm:w-40">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-semibold truncate">{t.name}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  Topic
                </div>
                {isEditing ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") save(t.name);
                      if (e.key === "Escape") cancel();
                    }}
                    className="w-full bg-transparent border-b border-[oklch(0.85_0.18_200/0.6)] outline-none text-sm font-mono py-0.5 neon-text-cyan"
                  />
                ) : (
                  <div className="text-sm font-mono truncate text-foreground/90">{t.topic}</div>
                )}
              </div>
              <div className="flex-shrink-0 flex items-center gap-1">
                {isEditing ? (
                  <>
                    <button
                      onClick={() => save(t.name)}
                      disabled={isSaving || draft.trim() === ""}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-[oklch(0.85_0.22_150/0.4)] bg-[oklch(0.85_0.22_150/0.08)] neon-text-green hover:bg-[oklch(0.85_0.22_150/0.16)] disabled:opacity-50"
                      aria-label="Save"
                    >
                      {isSaving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={cancel}
                      disabled={isSaving}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                      aria-label="Cancel"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => beginEdit(t)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground hover:border-white/20"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-start gap-2 text-[11px] text-muted-foreground border-t border-white/5 pt-3">
        <Save className="h-3.5 w-3.5 mt-0.5 neon-text-cyan" />
        <span>
          Changes are pushed via <span className="font-mono neon-text-cyan">PUT /topics/{"{name}"}</span> and take effect on next MQTT message.
        </span>
      </div>
    </motion.section>
  );
}
