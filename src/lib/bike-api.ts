import { supabase } from "@/integrations/supabase/client";
import { API_BASE, FIRMWARE_MANIFEST_URL, type Bike, type FirmwareManifest, type SystemMode } from "./bike-types";


async function post(path: string) {
  try {
    const res = await fetch(`${API_BASE}${path}`, { method: "POST" });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return res.json().catch(() => ({}));
  } catch (e) {
    // Backend may be offline during dev; allow DB mode update to still succeed
    console.warn(`[bike-api] ${path} unreachable:`, (e as Error).message);
    return {};
  }
}

function q(bikeId?: string) {
  return bikeId ? `?bike_id=${encodeURIComponent(bikeId)}` : "";
}

async function setMode(bikeId: string | undefined, mode: SystemMode) {
  if (!bikeId) return;
  const { error } = await supabase
    .from("bikes")
    .update({
      session_mode: mode,
      session_started_at: mode === "IDLE" ? null : new Date().toISOString(),
    })
    .eq("id", bikeId);
  if (error) throw error;
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
  startBike: async (bikeId?: string) => { await post(`/bike/start${q(bikeId)}`); await setMode(bikeId, "ACTIVE"); },
  stopBike: async (bikeId?: string) => { await post(`/bike/stop${q(bikeId)}`); await setMode(bikeId, "IDLE"); },
  startSimulation: async (bikeId?: string) => { await post(`/simulation/start${q(bikeId)}`); await setMode(bikeId, "SIMULATION"); },
  stopSimulation: async (bikeId?: string) => { await post(`/simulation/stop${q(bikeId)}`); await setMode(bikeId, "IDLE"); },

  // Audio — publishes {"command":"play_start"} / {"command":"play_stop"} to the bike's audio topic.
  // The ESP32 firmware handles the actual DFPlayer playback (0001.mp3 / 0002.mp3).
  playStartAudio: async (bikeId?: string) => { await post(`/audio/start${q(bikeId)}`); },
  playStopAudio: async (bikeId?: string) => { await post(`/audio/stop${q(bikeId)}`); },

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

  // Firmware / OTA
  getLatestFirmware: async (): Promise<FirmwareManifest> => {
    const res = await fetch(FIRMWARE_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    return (await res.json()) as FirmwareManifest;
  },
  triggerFirmwareUpdate: async (bikeId: string, manifest: FirmwareManifest) => {
    // Mark target in DB immediately so UI reflects intent
    await supabase
      .from("bikes")
      .update({
        firmware_target_version: manifest.version,
        firmware_state: "requested",
        firmware_progress: 0,
        firmware_message: "OTA requested",
        firmware_updated_at: new Date().toISOString(),
      })
      .eq("id", bikeId);
    // Ask backend to publish MQTT OTA command on the bike/ota/update topic
    await post(`/firmware/update${q(bikeId)}`);
    // Also send payload via generic /publish as a fallback for backends without /firmware
    try {
      await fetch(`${API_BASE}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: "bike/ota/update",
          payload: { command: "update", version: manifest.version, url: manifest.url, sha256: manifest.sha256 ?? null },
        }),
      });
    } catch {
      /* backend offline — DB state still updated */
    }
  },
};

