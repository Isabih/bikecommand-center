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
      setTelemetry((prev) => ({ ...prev, ...patch }));
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
            };
            // Accept message if:
            //  - no filter is configured, OR
            //  - bridge tagged it for this bike (topic→bike mapping), OR
            //  - payload esp32_id matches this bike's esp32_id.
            // This way the dashboard still updates even when the firmware
            // publishes a different esp32_id than what's stored on the bike row.
            const matchesBike = bikeId && data._bike_id && data._bike_id === bikeId;
            const matchesEsp = esp32Id && data.esp32_id && data.esp32_id === esp32Id;
            const hasAnyFilter = Boolean(esp32Id || bikeId);
            if (hasAnyFilter && !matchesBike && !matchesEsp) return;
            // merge into pending patch — newest values win
            pending.current = pending.current ? { ...pending.current, ...data } : data;
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
