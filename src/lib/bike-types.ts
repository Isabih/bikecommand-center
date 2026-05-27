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
  created_at: string;
  updated_at: string;
}

export const API_BASE =
  (typeof window !== "undefined" &&
    (window as unknown as { __BIKE_API__?: string }).__BIKE_API__) ||
  "http://localhost:8000";

export const WS_URL = API_BASE.replace(/^http/, "ws") + "/ws";
