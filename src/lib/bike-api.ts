import { supabase } from "@/integrations/supabase/client";
import { API_BASE, type Bike } from "./bike-types";

async function post(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

function q(bikeId?: string) {
  return bikeId ? `?bike_id=${encodeURIComponent(bikeId)}` : "";
}

export interface TopicConfig {
  id: string;
  bike_id: string | null;
  name: string;
  topic: string;
  description: string | null;
  direction: "sub" | "pub" | "both";
  last_seen_at: string | null;
  last_payload: string | null;
  updated_at: string;
}

export const bikeApi = {
  // Control (per-bike when provided; backend should publish on that bike's topics)
  startBike: (bikeId?: string) => post(`/bike/start${q(bikeId)}`),
  stopBike: (bikeId?: string) => post(`/bike/stop${q(bikeId)}`),
  startSimulation: (bikeId?: string) => post(`/simulation/start${q(bikeId)}`),
  stopSimulation: (bikeId?: string) => post(`/simulation/stop${q(bikeId)}`),

  // Bikes
  listBikes: async (): Promise<Bike[]> => {
    const { data, error } = await supabase
      .from("bikes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Bike[];
  },
  getBike: async (id: string): Promise<Bike | null> => {
    const { data, error } = await supabase
      .from("bikes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return (data as Bike) ?? null;
  },
  createBike: async (input: { name: string; esp32_id: string; description?: string }) => {
    const { data, error } = await supabase
      .from("bikes")
      .insert({
        name: input.name,
        esp32_id: input.esp32_id,
        description: input.description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as Bike;
  },
  deleteBike: async (id: string) => {
    const { error } = await supabase.from("bikes").delete().eq("id", id);
    if (error) throw error;
  },

  // Topics (optionally scoped by bike_id)
  listTopics: async (bikeId?: string): Promise<TopicConfig[]> => {
    let query = supabase.from("mqtt_topics").select("*").order("name");
    if (bikeId) query = query.eq("bike_id", bikeId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as TopicConfig[];
  },
  createTopic: async (input: {
    bike_id?: string | null;
    name: string;
    topic: string;
    description?: string;
    direction?: "sub" | "pub" | "both";
  }) => {
    const { data, error } = await supabase
      .from("mqtt_topics")
      .insert({
        bike_id: input.bike_id ?? null,
        name: input.name,
        topic: input.topic,
        description: input.description ?? null,
        direction: input.direction ?? "sub",
      })
      .select()
      .single();
    if (error) throw error;
    return data as TopicConfig;
  },
  updateTopic: async (
    id: string,
    patch: Partial<Pick<TopicConfig, "name" | "topic" | "description" | "direction">>,
  ) => {
    const { data, error } = await supabase
      .from("mqtt_topics")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as TopicConfig;
  },
  deleteTopic: async (id: string) => {
    const { error } = await supabase.from("mqtt_topics").delete().eq("id", id);
    if (error) throw error;
  },
};
