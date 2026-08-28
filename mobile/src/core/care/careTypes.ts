import { archetypeProfile, type VehicleDiagnosticProfile } from "../vehicle/vehicleProfile";

export type CueSeverity = "celebration" | "coach" | "protective" | "critical";

const SEVERITY_RANK: Record<CueSeverity, number> = {
  celebration: 0,
  coach: 1,
  protective: 2,
  critical: 3,
};

export function severityRank(s: CueSeverity): number {
  return SEVERITY_RANK[s];
}

export interface CareCue {
  id: string;
  text: string;
  severity: CueSeverity;
  localizationKey?: string;
}

export interface CareChannelPlan {
  speak: boolean;
  phoneChip: boolean;
  fullScreen: boolean;
  notification: boolean;
  toneCount: number;
}

export interface CareContext {
  now: number;
  /** Per-vehicle thermal/electrical constants. Watchdogs must judge against this
   * rather than one hardcoded threshold for every car. */
  vehicle: VehicleDiagnosticProfile;
  ambientC?: number;
  oilTempC?: number;
  oilIsEstimated: boolean;
  engineReady: boolean;
  isColdPhase: boolean;
  isCityTraffic: boolean;
  tripDistanceKm: number;
  tripDurationS: number;
  isVehicleStopped: boolean;
  sensitivityOffsetC: number;
  liveEcoScore: number;
}

export function emptyCareContext(now = Date.now()): CareContext {
  return {
    now,
    vehicle: archetypeProfile("gasolineNA", "gasoline"),
    oilIsEstimated: true,
    engineReady: false,
    isColdPhase: true,
    isCityTraffic: false,
    tripDistanceKm: 0,
    tripDurationS: 0,
    isVehicleStopped: true,
    sensitivityOffsetC: 0,
    liveEcoScore: 100,
  };
}

export function bucketAmbient(c: number | undefined): string {
  if (c == null) return "ambient:unknown";
  if (c < 0) return "ambient:<0";
  if (c < 10) return "ambient:0-10";
  if (c < 20) return "ambient:10-20";
  if (c < 30) return "ambient:20-30";
  return "ambient:>30";
}

export function bucketLoad(pct: number | undefined): string {
  if (pct == null) return "load:unknown";
  if (pct < 40) return "load:<40";
  if (pct < 70) return "load:40-70";
  return "load:>70";
}

export function bucketSpeed(kmh: number | undefined): string {
  if (kmh == null) return "speed:unknown";
  if (kmh < 0.5) return "speed:0";
  if (kmh < 50) return "speed:1-50";
  if (kmh < 90) return "speed:50-90";
  return "speed:>90";
}

export function compositeBucket(ambient: number | undefined, load: number | undefined, speed: number | undefined): string {
  return [bucketAmbient(ambient), bucketLoad(load), bucketSpeed(speed)].join("|");
}
