import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Bike as BikeIcon, ChevronRight, Cpu, Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { bikeApi } from "@/lib/bike-api";
import type { Bike } from "@/lib/bike-types";
import { supabase } from "@/integrations/supabase/client";
import { ModeBadge } from "@/components/bike/ModeBadge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  component: BikesIndex,
  head: () => ({
    meta: [
      { title: "Registered Bikes — IoT Control Center" },
      {
        name: "description",
        content: "Register and select a bike to start its telemetry session.",
      },
    ],
  }),
});

function BikesIndex() {
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", esp32_id: "", description: "" });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      setBikes(await bikeApi.listBikes());
    } catch (e) {
      toast.error("Failed to load bikes", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("bikes_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "bikes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const create = async () => {
    if (!draft.name.trim() || !draft.esp32_id.trim()) {
      toast.error("Name and ESP32 ID are required");
      return;
    }
    setCreating(true);
    try {
      const b = await bikeApi.createBike({
        name: draft.name.trim(),
        esp32_id: draft.esp32_id.trim(),
        description: draft.description.trim() || undefined,
      });
      toast.success(`Registered "${b.name}"`);
      setDraft({ name: "", esp32_id: "", description: "" });
      setAdding(false);
      navigate({ to: "/bikes/$id", params: { id: b.id } });
    } catch (e) {
      toast.error("Register failed", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const remove = async (b: Bike) => {
    if (!confirm(`Delete bike "${b.name}"? This will remove its topics and history.`)) return;
    setBusyId(b.id);
    try {
      await bikeApi.deleteBike(b.id);
      toast.success(`Deleted "${b.name}"`);
    } catch (e) {
      toast.error("Delete failed", { description: (e as Error).message });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-8 relative space-y-6">
      <motion.section
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bike Registry</h1>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground mt-1">
            Register a bike, then start a session to receive live telemetry on its topics.
          </p>
        </div>
        <button
          onClick={() => setAdding((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[11px] uppercase tracking-[0.2em] transition-all",
            adding
              ? "border-white/10 bg-white/5 text-muted-foreground"
              : "border-[oklch(0.85_0.22_150/0.5)] bg-[oklch(0.85_0.22_150/0.08)] neon-text-green hover:bg-[oklch(0.85_0.22_150/0.16)]",
          )}
        >
          <Plus className="h-4 w-4" />
          {adding ? "Cancel" : "Register Bike"}
        </button>
      </motion.section>

      {adding && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <input
            placeholder="Bike name (e.g. Test Bike #1)"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
          />
          <input
            placeholder="ESP32 ID (matches device payload)"
            value={draft.esp32_id}
            onChange={(e) => setDraft({ ...draft, esp32_id: e.target.value })}
            className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm font-mono outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
          />
          <input
            placeholder="Description (optional)"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="bg-transparent border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:border-[oklch(0.85_0.22_150/0.6)]"
          />
          <div className="md:col-span-3 flex justify-end">
            <button
              onClick={create}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-md border border-[oklch(0.85_0.22_150/0.5)] bg-[oklch(0.85_0.22_150/0.12)] neon-text-green px-4 py-2 text-[11px] uppercase tracking-[0.2em] hover:bg-[oklch(0.85_0.22_150/0.2)] disabled:opacity-50"
            >
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Register
            </button>
          </div>
        </motion.div>
      )}

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin inline" />
        </div>
      ) : bikes.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 text-center">
          <BikeIcon className="h-10 w-10 mx-auto neon-text-cyan opacity-60" />
          <h2 className="mt-3 text-lg font-semibold">No bikes registered yet</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Click <b>Register Bike</b> to add your first one.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {bikes.map((b) => (
            <motion.div
              key={b.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-2xl p-5 hover:border-[oklch(0.85_0.18_200/0.4)] transition-all group relative"
            >
              <Link to="/bikes/$id" params={{ id: b.id }} className="block">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl glass-panel grid place-items-center neon-text-cyan">
                    <BikeIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold truncate">{b.name}</h3>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Cpu className="h-3 w-3" />
                      <span className="font-mono normal-case tracking-normal">{b.esp32_id}</span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:neon-text-cyan group-hover:translate-x-0.5 transition-all" />
                </div>
                {b.description && (
                  <p className="text-xs text-muted-foreground mt-3 line-clamp-2">{b.description}</p>
                )}
              </Link>
              <button
                onClick={() => remove(b)}
                disabled={busyId === b.id}
                className="absolute top-3 right-3 inline-flex items-center justify-center h-7 w-7 rounded-md border border-[oklch(0.7_0.26_25/0.3)] bg-[oklch(0.7_0.26_25/0.04)] neon-text-red opacity-0 group-hover:opacity-100 hover:bg-[oklch(0.7_0.26_25/0.14)] disabled:opacity-50"
                aria-label="Delete"
              >
                {busyId === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </main>
  );
}
