import { useSyncExternalStore } from "react";

/**
 * Runtime (browser-persisted) connection settings.
 * Lets the operator point the dashboard at a different FastAPI bridge and
 * tell that bridge which Mosquitto broker to talk to — without a rebuild.
 */
export interface RuntimeConfig {
  /** FastAPI bridge base URL, e.g. http://192.168.1.64:8000 */
  apiBase: string;
  /** Mosquitto broker IP / hostname */
  mqttHost: string;
  /** Mosquitto broker port */
  mqttPort: number;
}

const KEY = "apaforme.runtime-config";
const EVT = "apaforme:config";

export const DEFAULT_CONFIG: RuntimeConfig = {
  apiBase: "http://localhost:8000",
  mqttHost: "192.168.1.64",
  mqttPort: 1884,
};

let cache: RuntimeConfig | null = null;

function read(): RuntimeConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  if (cache) return cache;
  const injected = (window as unknown as { __BIKE_API__?: string }).__BIKE_API__;
  let parsed: Partial<RuntimeConfig> = {};
  try {
    parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<RuntimeConfig>;
  } catch {
    /* corrupted entry — fall back to defaults */
  }
  cache = {
    apiBase: (parsed.apiBase || injected || DEFAULT_CONFIG.apiBase).replace(/\/+$/, ""),
    mqttHost: parsed.mqttHost || DEFAULT_CONFIG.mqttHost,
    mqttPort: Number(parsed.mqttPort) || DEFAULT_CONFIG.mqttPort,
  };
  return cache;
}

export function getConfig(): RuntimeConfig {
  return read();
}

export function setConfig(patch: Partial<RuntimeConfig>): RuntimeConfig {
  const next: RuntimeConfig = { ...read(), ...patch };
  next.apiBase = next.apiBase.replace(/\/+$/, "");
  next.mqttPort = Number(next.mqttPort) || DEFAULT_CONFIG.mqttPort;
  cache = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVT));
  }
  return next;
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    cache = null;
    cb();
  };
  window.addEventListener(EVT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Reactive access to the runtime config (SSR-safe). */
export function useRuntimeConfig(): RuntimeConfig {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_CONFIG);
}

export function getApiBase(): string {
  return read().apiBase;
}

export function getWsUrl(): string {
  return read().apiBase.replace(/^http/, "ws") + "/ws";
}
