export interface BikeTelemetry {
  esp32_id: string;
  speed: number;
  ignition: boolean;
  brake: boolean;
  left_indicator: boolean;
  right_indicator: boolean;
  left_leg: boolean;
  right_leg: boolean;
  heartbeat: boolean;
}

export const INITIAL_TELEMETRY: BikeTelemetry = {
  esp32_id: "—",
  speed: 0,
  ignition: false,
  brake: false,
  left_indicator: false,
  right_indicator: false,
  left_leg: false,
  right_leg: false,
  heartbeat: false,
};

export type SystemMode = "IDLE" | "ACTIVE" | "SIMULATION";

export interface Bike {
  id: string;
  name: string;
  esp32_id: string;
  description: string | null;
  session_mode: SystemMode;
  session_started_at: string | null;
  firmware_version: string | null;
  firmware_reported_at: string | null;
  firmware_state: string;
  firmware_progress: number;
  firmware_message: string | null;
  firmware_target_version: string | null;
  firmware_pinned_version: string | null;
  firmware_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FirmwareManifest {
  version: string;
  url: string;
  notes?: string;
  sha256?: string;
  released_at?: string;
}

export interface FirmwareVersionRow {
  id: string;
  version: string;
  url: string;
  sha256: string | null;
  notes: string | null;
  released_at: string | null;
  is_latest: boolean;
  source: string;
  fetched_at: string;
}

export const FIRMWARE_MANIFEST_URL =
  "https://raw.githubusercontent.com/Isabih/apaforme-firmware/main/firmwares/apaforme/latest.json";


// Connection settings are runtime-configurable from the dashboard Settings page.
export { getApiBase, getWsUrl } from "./runtime-config";
