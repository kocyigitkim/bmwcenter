import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useOBDStore } from "./obdService";
import { useAppSettings } from "../settings/appSettings";

const FIRST_RETRY_MS = 3000;
const MAX_RETRY_MS = 60_000;

/** Connects to the remembered adapter on launch and re-establishes the link after an
 * unexpected drop, with exponential backoff so a car that is simply switched off does
 * not keep the radio busy. A deliberate disconnect sets `autoConnectSuppressed` in the
 * store, which stops this loop until the user asks to connect again. */
export function useAutoConnectRunner(): void {
  const autoConnectOnLaunch = useAppSettings((s) => s.autoConnectOnLaunch);
  const autoReconnect = useAppSettings((s) => s.autoReconnect);
  const useMockAdapter = useAppSettings((s) => s.useMockAdapter);
  const connectionStatus = useOBDStore((s) => s.connection.status);

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const backoff = useRef(FIRST_RETRY_MS);
  const inFlight = useRef(false);

  // Transport selection lives here rather than on the dashboard so it is guaranteed to
  // happen before the first connect attempt — otherwise auto-connect could race and run
  // against the simulated transport.
  const useMockTransport = useOBDStore((s) => s.useMockTransport);
  useEffect(() => {
    useMockTransport(useMockAdapter);
  }, [useMockAdapter, useMockTransport]);

  useEffect(() => {
    if (useMockAdapter || !autoConnectOnLaunch) return;

    let cancelled = false;

    const clearTimer = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = undefined;
    };

    const attempt = async () => {
      if (cancelled || inFlight.current) return;
      const store = useOBDStore.getState();
      const status = store.connection.status;
      if (status === "connected" || status === "connecting" || status === "scanning") return;
      if (store.autoConnectSuppressed) return;

      inFlight.current = true;
      const ok = await store.autoConnect().catch(() => false);
      inFlight.current = false;
      if (cancelled) return;

      if (ok) {
        backoff.current = FIRST_RETRY_MS;
        return;
      }
      if (!autoReconnect) return;
      clearTimer();
      timer.current = setTimeout(attempt, backoff.current);
      backoff.current = Math.min(backoff.current * 2, MAX_RETRY_MS);
    };

    // Launch, a dropped link, and returning to the foreground all funnel into `attempt`,
    // which no-ops whenever a connection is already up or in progress.
    if (connectionStatus === "idle" || connectionStatus === "disconnected" || connectionStatus === "error") {
      attempt();
    }

    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        backoff.current = FIRST_RETRY_MS;
        attempt();
      }
    });

    return () => {
      cancelled = true;
      clearTimer();
      sub.remove();
    };
  }, [autoConnectOnLaunch, autoReconnect, useMockAdapter, connectionStatus]);
}
