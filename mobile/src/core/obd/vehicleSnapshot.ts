export interface VehicleSnapshot {
  timestamp: number;
  speedKmh?: number;
  rpm?: number;
  coolantC?: number;
  fuelLevelPct?: number;
  mafGs?: number;
  mapKpa?: number;
  intakeAirC?: number;
  throttlePct?: number;
  engineLoadPct?: number;
  voltage?: number;
  engineFuelRateLh?: number;
  runtimeS?: number;
  oilTempC?: number;
  transmissionOilTempC?: number;
  oilPressureBar?: number;
  boostSetpointKpa?: number;
  boostActualKpa?: number;
  fuelRailBar?: number;
  radiatorOutletC?: number;
  intercoolerC?: number;
  mafKgh?: number;
  vanosIntakeDeg?: number;
  vanosExhaustDeg?: number;
  lowPressureFuelBar?: number;
  alternatorVoltage?: number;
  batterySocPct?: number;
  baroKpa?: number;
  ambientC?: number;
  stftBank1?: number;
  ltftBank1?: number;
  stftBank2?: number;
  ltftBank2?: number;
  catalystC?: number;
  fuelRailKpa?: number;
  pedalPct?: number;
  timingAdvance?: number;
  distanceSinceClearKm?: number;
  distanceWithMILKm?: number;
}

export function emptySnapshot(): VehicleSnapshot {
  return { timestamp: Date.now() };
}

export function isEngineRunning(s: VehicleSnapshot): boolean {
  return (s.rpm ?? 0) > 300;
}

export function isStale(s: VehicleSnapshot): boolean {
  return Date.now() - s.timestamp > 3000;
}

/** Turbo boost (relative kPa). Prefers BMW Mode 22 charge pressure; else MAP - baro. */
export function boostKpa(s: VehicleSnapshot): number | undefined {
  if (s.boostActualKpa != null) {
    const baro = s.baroKpa ?? 101.325;
    return s.boostActualKpa - baro;
  }
  if (s.mapKpa == null || s.baroKpa == null) return undefined;
  return s.mapKpa - s.baroKpa;
}

export function boostBar(s: VehicleSnapshot): number | undefined {
  const kpa = boostKpa(s);
  return kpa == null ? undefined : kpa / 100;
}

export function boostActualBar(s: VehicleSnapshot): number | undefined {
  return s.boostActualKpa == null ? undefined : s.boostActualKpa / 100;
}

export type DTCStatus = "stored" | "pending" | "permanent";

export interface DTC {
  code: string;
  status: DTCStatus;
  descriptionKey?: string;
  summary?: string;
  severity?: string;
  firstSeen: number;
}
