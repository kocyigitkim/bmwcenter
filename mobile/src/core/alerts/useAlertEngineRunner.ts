import { useEffect, useRef } from "react";
import { useOBDStore } from "../obd/obdService";
import { useAlertEngine } from "./alertEngine";

/** Mirrors AlertEngine.startListening: evaluates at most once per second. */
export function useAlertEngineRunner(): void {
  const snapshot = useOBDStore((s) => s.snapshot);
  const lastEval = useRef(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastEval.current < 1000) return;
    lastEval.current = now;
    useAlertEngine.getState().evaluate(snapshot, now);
  }, [snapshot]);
}
