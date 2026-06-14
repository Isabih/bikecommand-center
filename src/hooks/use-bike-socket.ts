import { useEffect, useRef, useState } from "react";
import { WS_URL, INITIAL_TELEMETRY, type BikeTelemetry } from "@/lib/bike-types";

export type ConnState = "connecting" | "connected" | "disconnected";

/** If no telemetry arrives for this long, everything drops to LOW. */
const STALE_MS = 6000;

/**
 * Connects to the FastAPI WebSocket and aggregates the live telemetry stream.
 * When `esp32Id` is provided, only messages with a matching `esp32_id` are accepted.
 *
 * Real-time behavior:
 * - Each payload is an authoritative snapshot (missing fields → LOW/0).
 * - Updates are applied immediately (no throttle) so the UI mirrors the
 *   ESP32 stream with minimal latency.
 * - A stale watchdog forces everything LOW if the device stops publishing.
 */
export function useBikeSocket(esp32Id?: string, bikeId?: string) {
  const [telemetry, setTelemetry] = useState<BikeTelemetry>(INITIAL_TELEMETRY);
  const [wsState, setWsState] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);
  const staleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let closed = false;

    const armStaleWatchdog = () => {
      if (staleTimerRef.current != null) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = window.setTimeout(() => {
        setTelemetry({ ...INITIAL_TELEMETRY });
      }, STALE_MS);
    };

    const applySnapshot = (data: Partial<BikeTelemetry>) => {
      // Each payload is a complete authoritative snapshot — missing fields → LOW/0.
      const next: BikeTelemetry = { ...INITIAL_TELEMETRY, ...data };
      // Real-bike rule: ignition OFF ⇒ nothing else can be active.
      if (!next.ignition) {
        next.speed = 0;
        next.brake = false;
        next.left_indicator = false;
        next.right_indicator = false;
        next.left_leg = false;
        next.right_leg = false;
      }
      setTelemetry(next);
      setLastUpdate(Date.now());
      setHeartbeatTick((t) => t + 1);
      armStaleWatchdog();
    };

    const connect = () => {
      if (closed) return;
      setWsState("connecting");
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;
        ws.onopen = () => setWsState("connected");
        ws.onclose = () => {
          setWsState("disconnected");
          if (!closed) retryRef.current = window.setTimeout(connect, 2500);
        };
        ws.onerror = () => ws.close();
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as Partial<BikeTelemetry> & {
              _bike_id?: string | null;
              _topic?: string;
            };
            const matchesBike = bikeId && data._bike_id && data._bike_id === bikeId;
            const matchesEsp = esp32Id && data.esp32_id && data.esp32_id === esp32Id;
            const hasAnyFilter = Boolean(esp32Id || bikeId);
            if (hasAnyFilter && !matchesBike && !matchesEsp) return;
            const isTelemetry =
              data._topic === "bike/data" ||
              "speed" in data ||
              "ignition" in data ||
              "heartbeat" in data;
            if (!isTelemetry) return;
            // Apply immediately — no throttle, no coalescing — so the UI
            // mirrors the ESP32 stream in real time even before a session
            // is "started" from the dashboard.
            applySnapshot(data);
          } catch {
            /* ignore */
          }
        };
      } catch {
        setWsState("disconnected");
        retryRef.current = window.setTimeout(connect, 2500);
      }
    };
    connect();
    return () => {
      closed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      if (staleTimerRef.current != null) clearTimeout(staleTimerRef.current);
      wsRef.current?.close();
    };
  }, [esp32Id, bikeId]);

  const reset = () => {
    setTelemetry({ ...INITIAL_TELEMETRY });
    setLastUpdate(Date.now());
  };

  return { telemetry, wsState, lastUpdate, heartbeatTick, reset };
}
