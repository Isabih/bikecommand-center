import { useCallback, useEffect, useRef, useState } from "react";
import { getWsUrl, INITIAL_TELEMETRY, type BikeTelemetry } from "@/lib/bike-types";
import { useRuntimeConfig } from "@/lib/runtime-config";

export type ConnState = "connecting" | "connected" | "disconnected";

/** If no telemetry arrives for this long, everything drops to LOW. */
const STALE_MS = 2000;
/** After a local command (Stop/Start/Sim), ignore in-flight stale
 *  payloads that contradict the new mode for this long. */
const COMMAND_LOCK_MS = 1000;

/**
 * Connects to the FastAPI WebSocket and aggregates the live telemetry stream.
 * When `esp32Id` is provided, only messages with a matching `esp32_id` are accepted.
 *
 * Real-time behavior:
 * - Each payload is an authoritative snapshot (missing fields → LOW/0).
 * - Duplicate consecutive snapshots are dropped (no re-render noise).
 * - Ignition OFF forces every other field to OFF/0 (real-bike gate).
 * - `commandLock(mode)` freezes the UI to the just-issued mode for 1s so
 *   stale in-flight telemetry from the previous mode cannot flap it back.
 * - A 2s stale watchdog resets state when the device stops publishing.
 */
export function useBikeSocket(esp32Id?: string, bikeId?: string) {
  // Reconnect whenever the operator repoints the dashboard at another bridge.
  const { apiBase } = useRuntimeConfig();
  const [telemetry, setTelemetry] = useState<BikeTelemetry>(INITIAL_TELEMETRY);
  const [wsState, setWsState] = useState<ConnState>("connecting");
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [heartbeatTick, setHeartbeatTick] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number | null>(null);
  const staleTimerRef = useRef<number | null>(null);
  const lastSnapshotRef = useRef<string>("");
  /** After Stop/Start, discard incoming payloads until this timestamp. */
  const commandLockUntilRef = useRef<number>(0);
  /** What mode the user just commanded — during lock, force UI to it. */
  const commandModeRef = useRef<"IDLE" | "ACTIVE" | "SIMULATION" | null>(null);

  useEffect(() => {
    let closed = false;

    const armStaleWatchdog = () => {
      if (staleTimerRef.current != null) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = window.setTimeout(() => {
        setTelemetry({ ...INITIAL_TELEMETRY });
        lastSnapshotRef.current = "";
      }, STALE_MS);
    };

    const applySnapshot = (data: Partial<BikeTelemetry>) => {
      const now = Date.now();
      // Command lock: during the ~1s after a local command, ignore any
      // payload that contradicts the commanded mode.
      if (now < commandLockUntilRef.current && commandModeRef.current === "IDLE") {
        // We just told the bike to stop → drop anything claiming it's on.
        if (data.ignition) return;
      }

      // Each payload is a complete authoritative snapshot — missing → LOW/0.
      const next: BikeTelemetry = { ...INITIAL_TELEMETRY, ...data };

      // Hard ignition gate: ignition OFF ⇒ nothing else can be active.
      if (!next.ignition) {
        next.speed = 0;
        next.brake = false;
        next.left_indicator = false;
        next.right_indicator = false;
        next.left_leg = false;
        next.right_leg = false;
      }

      // Payload debounce: drop exact duplicate consecutive snapshots.
      const sig = JSON.stringify(next);
      if (sig === lastSnapshotRef.current) {
        armStaleWatchdog();
        return;
      }
      lastSnapshotRef.current = sig;

      setTelemetry(next);
      setLastUpdate(now);
      setHeartbeatTick((t) => t + 1);
      armStaleWatchdog();
    };

    const connect = () => {
      if (closed) return;
      setWsState("connecting");
      try {
        const ws = new WebSocket(getWsUrl());
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
  }, [esp32Id, bikeId, apiBase]);

  /** Called by Stop / Turn-Off actions: instantly zeroes UI and holds it. */
  const reset = useCallback(() => {
    commandLockUntilRef.current = Date.now() + COMMAND_LOCK_MS;
    commandModeRef.current = "IDLE";
    lastSnapshotRef.current = "";
    setTelemetry({ ...INITIAL_TELEMETRY });
    setLastUpdate(Date.now());
  }, []);

  /** Called by Start / Simulation actions to lock the commanded mode briefly. */
  const commandLock = useCallback((mode: "IDLE" | "ACTIVE" | "SIMULATION") => {
    commandLockUntilRef.current = Date.now() + COMMAND_LOCK_MS;
    commandModeRef.current = mode;
  }, []);

  return { telemetry, wsState, lastUpdate, heartbeatTick, reset, commandLock };
}
