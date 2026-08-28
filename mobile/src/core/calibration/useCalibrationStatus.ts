import { useCallback, useEffect, useState } from "react";
import { fuelCalibrator, type FuelCalStatus } from "../fuel/fuelCalibrator";
import { speedCalibrator } from "../analysis/speedCalibrator";

export interface SpeedCalStatus {
  sampleCount: number;
  requiredSamples: number;
  progress: number;
  factor: number;
  isCalibrated: boolean;
}

export interface CalibrationStatus {
  fuel?: FuelCalStatus;
  speed: SpeedCalStatus;
  /** True once both calibrations have finished. */
  isComplete: boolean;
  reload: () => void;
}

function readSpeed(): SpeedCalStatus {
  return {
    sampleCount: speedCalibrator.sampleCount,
    requiredSamples: speedCalibrator.requiredSamples,
    progress: speedCalibrator.progress,
    factor: 0, // filled by the caller from settings, which is reactive
    isCalibrated: speedCalibrator.isCalibrated,
  };
}

/** Snapshot of both calibrations. The speed calibrator is not reactive (it fills
 * up sample by sample while driving), so this polls lightly while mounted. */
export function useCalibrationStatus(pollMs = 3000): CalibrationStatus {
  const [fuel, setFuel] = useState<FuelCalStatus | undefined>(undefined);
  const [speed, setSpeed] = useState<SpeedCalStatus>(readSpeed);

  const reload = useCallback(() => {
    fuelCalibrator.status().then(setFuel).catch(() => undefined);
    setSpeed(readSpeed());
  }, []);

  useEffect(() => {
    reload();
    const handle = setInterval(reload, pollMs);
    return () => clearInterval(handle);
  }, [reload, pollMs]);

  return {
    fuel,
    speed,
    isComplete: (fuel?.isCalibrated ?? false) && speed.isCalibrated,
    reload,
  };
}
