import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Cpu, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { TopicsEditor } from "@/components/bike/TopicsEditor";
import { LiveTopicTable } from "@/components/bike/LiveTopicTable";
import { bikeApi } from "@/lib/bike-api";
import type { Bike } from "@/lib/bike-types";

export const Route = createFileRoute("/bikes/$id/topics")({
  component: BikeTopicsPage,
  head: () => ({
    meta: [
      { title: "MQTT Topics — Bike IoT Control Center" },
      { name: "description", content: "Edit MQTT topic bindings and watch live activity for the selected bike." },
    ],
  }),
});

function BikeTopicsPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [bike, setBike] = useState<Bike | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let canceled = false;
    bikeApi
      .getBike(id)
      .then((b) => {
        if (canceled) return;
        if (!b) navigate({ to: "/" });
        else setBike(b);
      })
      .finally(() => !canceled && setLoading(false));
    return () => {
      canceled = true;
    };
  }, [id, navigate]);

  if (loading || !bike) {
    return (
      <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-12 text-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin inline" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[1500px] px-4 sm:px-6 py-6 space-y-6 relative">
      <section className="glass-panel rounded-2xl p-5 flex flex-wrap items-center gap-4">
        <Link
          to="/bikes/$id"
          params={{ id: bike.id }}
          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground hover:border-white/20"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold truncate">{bike.name} · Topics</h1>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Cpu className="h-3 w-3" />
            <span className="font-mono normal-case tracking-normal">{bike.esp32_id}</span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <TopicsEditor bikeId={bike.id} />
        <LiveTopicTable bikeId={bike.id} />
      </div>
    </main>
  );
}
