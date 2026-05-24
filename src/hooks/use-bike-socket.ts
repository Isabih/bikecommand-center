import { useEffect, useRef, useState } from "react";
import { WS_URL, INITIAL_TELEMETRY, type BikeTelemetry } from "@/lib/bike-types";

export type ConnState = "connecting" | "connected" | "disconnected";

export function useBikeSocket() {
  const [telemetry, setTelemetry] = useState<BikeTelemetry>(INITIAL_TELEMETRY);
  const [wsState, setWsState] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);

  useEffect(() => {
    let closed = false;

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
            const data = JSON.parse(ev.data) as Partial<BikeTelemetry>;
            setTelemetry((prev) => ({ ...prev, ...data }));
            setLastUpdate(Date.now());
            setHeartbeatTick((t) => t + 1);
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
      wsRef.current?.close();
    };
  }, []);

  return { telemetry, wsState, lastUpdate, heartbeatTick };
}
