import { useEffect } from "react";
import { useOBDStore } from "../obd/obdService";
import { useTripRecorder } from "./tripRecorder";

/** Drives the trip-recording state machine off the live OBD snapshot stream. */
export function useTripRecorderRunner(): void {
  const snapshot = useOBDStore((s) => s.snapshot);
  const connection = useOBDStore((s) => s.connection);

  useEffect(() => {
    useTripRecorder.getState().handle(snapshot, connection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);
}
