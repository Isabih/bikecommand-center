import { supabase } from "@/integrations/supabase/client";
import { getApiBase, FIRMWARE_MANIFEST_URL, type Bike, type FirmwareManifest, type FirmwareVersionRow, type SystemMode } from "./bike-types";


async function post(path: string) {
  try {
    const res = await fetch(`${getApiBase()}${path}`, { method: "POST" });
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
  listAvailableFirmware: async (): Promise<FirmwareVersionRow[]> => {
    const { data, error } = await supabase
      .from("firmware_versions")
      .select("*")
      .order("released_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as FirmwareVersionRow[];
  },
  /**
   * Returns the cached "latest" manifest. Falls back to raw GitHub if the
   * cache is empty (first boot before the hourly cron has run).
   */
  getLatestFirmware: async (): Promise<FirmwareManifest> => {
    const { data } = await supabase
      .from("firmware_versions")
      .select("*")
      .eq("is_latest", true)
      .maybeSingle();
    if (data) {
      return {
        version: data.version,
        url: data.url,
        sha256: data.sha256 ?? undefined,
        notes: data.notes ?? undefined,
        released_at: data.released_at ?? undefined,
      };
    }
    const res = await fetch(FIRMWARE_MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
    return (await res.json()) as FirmwareManifest;
  },
  /** Ask the backend to re-poll GitHub now (bypasses the hourly cron). */
  refreshFirmwareCache: async (): Promise<{ ok: boolean; upserted?: number; error?: string }> => {
    try {
      const res = await fetch("/api/public/hooks/refresh-firmware", { method: "POST" });
      return (await res.json()) as { ok: boolean; upserted?: number; error?: string };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  /** Pin (or clear) the firmware version a bike should install on the next update. */
  setBikeFirmwareTarget: async (bikeId: string, version: string | null) => {
    const { error } = await supabase
      .from("bikes")
      .update({ firmware_pinned_version: version })
      .eq("id", bikeId);
    if (error) throw error;
  },
  /**
   * Marks the OTA intent in the database, then asks the bridge to publish the
   * command on the bike's *configured* ota_update topic. The bridge resolves
   * the topic from `mqtt_topics` and fills the payload from the cached GitHub
   * manifest (version + firmware_url + sha256) — no hardcoded topics here.
   */
  triggerFirmwareUpdate: async (bikeId: string, manifest: FirmwareManifest) => {
    const { error } = await supabase
      .from("bikes")
      .update({
        firmware_target_version: manifest.version,
        firmware_state: "requested",
        firmware_progress: 0,
        firmware_message: "OTA requested",
        firmware_updated_at: new Date().toISOString(),
      })
      .eq("id", bikeId);
    if (error) throw error;

    const res = await fetch(`${getApiBase()}/firmware/update${q(bikeId)}`, { method: "POST" });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Bridge refused OTA (${res.status}) ${detail.slice(0, 160)}`);
    }
    return (await res.json().catch(() => ({}))) as { topic?: string };
  },
};


