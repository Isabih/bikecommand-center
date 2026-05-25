import { supabase } from "@/integrations/supabase/client";
import { API_BASE } from "./bike-types";

async function post(path: string) {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json().catch(() => ({}));
}

export interface TopicConfig {
  id: string;
  name: string;
  topic: string;
  description: string | null;
  direction: "sub" | "pub" | "both";
  last_seen_at: string | null;
  last_payload: string | null;
  updated_at: string;
}

export const bikeApi = {
  startBike: () => post("/bike/start"),
  stopBike: () => post("/bike/stop"),
  startSimulation: () => post("/simulation/start"),
  stopSimulation: () => post("/simulation/stop"),

  listTopics: async (): Promise<TopicConfig[]> => {
    const { data, error } = await supabase
      .from("mqtt_topics")
      .select("*")
      .order("name");
    if (error) throw error;
    return (data ?? []) as TopicConfig[];
  },

  createTopic: async (input: {
    name: string;
    topic: string;
    description?: string;
    direction?: "sub" | "pub" | "both";
  }) => {
    const { data, error } = await supabase
      .from("mqtt_topics")
      .insert({
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
