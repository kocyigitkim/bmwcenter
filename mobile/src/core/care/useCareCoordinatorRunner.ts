import { useEffect } from "react";
import { useOBDStore } from "../obd/obdService";
import { useCareCoordinator } from "./careCoordinator";

export function useCareCoordinatorRunner(): void {
  const snapshot = useOBDStore((s) => s.snapshot);

  useEffect(() => {
    useCareCoordinator.getState().evaluate(snapshot);
  }, [snapshot]);
}
