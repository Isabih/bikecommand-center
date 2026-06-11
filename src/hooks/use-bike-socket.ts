import { useEffect, useRef, useState } from "react";
import { WS_URL, INITIAL_TELEMETRY, type BikeTelemetry } from "@/lib/bike-types";

export type ConnState = "connecting" | "connected" | "disconnected";

/**
 * Connects to the FastAPI WebSocket and aggregates the live telemetry stream.
 * When `esp32Id` is provided, only messages with a matching `esp32_id` are accepted.
 *
 * Optimised for high-frequency telemetry: incoming messages are coalesced into a
 * single React state update per animation frame (~60 Hz max), preventing render
 * thrash while keeping the latest payload always visible.
 */
export function useBikeSocket(esp32Id?: string, bikeId?: string) {
  const [telemetry, setTelemetry] = useState<BikeTelemetry>(INITIAL_TELEMETRY);
  const [wsState, setWsState] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);

  // rAF-coalesced accumulators
  const pending = useRef<Partial<BikeTelemetry> | null>(null);
  const pendingCount = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  useEffect(() => {
    let closed = false;

    const flush = () => {
      rafRef.current = null;
      if (!pending.current) return;
      const patch = pending.current;
      const count = pendingCount.current;
      pending.current = null;
      pendingCount.current = 0;
      // Each payload is a complete snapshot — missing fields fall back to LOW/0.
      const next: BikeTelemetry = { ...INITIAL_TELEMETRY, ...patch };
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
      lastTsRef.current = performance.now();
      setLastUpdate(Date.now());
      setHeartbeatTick((t) => t + count);
    };

    const scheduleFlush = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(flush);
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
            // Only telemetry frames update bike state. Control/simulation
            // echoes from the backend are ignored.
            const isTelemetry =
              data._topic === "bike/data" ||
              "speed" in data ||
              "ignition" in data ||
              "heartbeat" in data;
            if (!isTelemetry) return;
            // Replace pending with the latest snapshot — each payload is
            // authoritative, no carry-over between messages.
            pending.current = data;
            pendingCount.current += 1;
            scheduleFlush();
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
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      wsRef.current?.close();
    };
  }, [esp32Id, bikeId]);

  return { telemetry, wsState, lastUpdate, heartbeatTick };
}
