export type TripCategory = "personal" | "business" | "other";

export interface DrivingEvent {
  type: string;
  t: number;
  severity: string;
  speedKmh: number;
  magnitude: number;
  latitude?: number;
  longitude?: number;
}

export interface Trip {
  id: string;
  startedAt: number;
  endedAt: number | null;
  distanceKm: number;
  durationS: number;
  movingDurationS: number;
  idleDurationS: number;
  fuelUsedL: number;
  idleFuelL: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  maxRpm: number;
  avgL100: number;
  startFuelPct: number | null;
  endFuelPct: number | null;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  startPlaceName: string | null;
  endPlaceName: string | null;
  routeData: Array<{ lat: number; lon: number; t: number }> | null;
  isManual: boolean;
  category: TripCategory;
  dataSource: string;
  scoreTotal: number | null;
  scoreBreakdownJSON: string | null;
  note: string | null;
  events?: DrivingEvent[];
}

export interface RefuelEntry {
  id: string;
  date: number;
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  odometerKm: number | null;
  isFullTank: boolean;
  stationName: string | null;
  note: string | null;
}

export interface FuelPricePoint {
  date: number;
  pricePerLiter: number;
  currencyCode: string;
}

export function isValidAvgL100(value: number): boolean {
  return value >= 0.5 && value <= 60;
}

export interface DrivingSummary {
  tripCount: number;
  distanceKm: number;
  durationS: number;
  fuelUsedL: number;
  idleFuelL: number;
  avgL100: number;
  bestL100: number;
  worstL100: number;
  maxSpeedKmh: number;
  estimatedCost: number;
  avgScore?: number;
  eventCounts: Record<string, number>;
}

export function emptyDrivingSummary(): DrivingSummary {
  return {
    tripCount: 0,
    distanceKm: 0,
    durationS: 0,
    fuelUsedL: 0,
    idleFuelL: 0,
    avgL100: 0,
    bestL100: 0,
    worstL100: 0,
    maxSpeedKmh: 0,
    estimatedCost: 0,
    eventCounts: {},
  };
}

export function summarize(trips: Trip[], pricePerLiter: number): DrivingSummary {
  const tripCount = trips.length;
  const distanceKm = trips.reduce((s, t) => s + t.distanceKm, 0);
  const durationS = trips.reduce((s, t) => s + t.durationS, 0);
  const fuelUsedL = trips.reduce((s, t) => s + t.fuelUsedL, 0);
  const idleFuelL = trips.reduce((s, t) => s + t.idleFuelL, 0);
  const maxSpeedKmh = trips.reduce((m, t) => Math.max(m, t.maxSpeedKmh), 0);
  const estimatedCost = fuelUsedL * pricePerLiter;
  const validL100 = trips.map((t) => t.avgL100).filter(isValidAvgL100);
  let avgL100 = 0;
  if (distanceKm > 0.1 && fuelUsedL > 0) {
    const v = (fuelUsedL / distanceKm) * 100;
    avgL100 = isValidAvgL100(v) ? v : 0;
  }
  const bestL100 = validL100.length ? Math.min(...validL100) : 0;
  const worstL100 = validL100.length ? Math.max(...validL100) : 0;
  const scores = trips.map((t) => t.scoreTotal).filter((s): s is number => s != null);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  const eventCounts: Record<string, number> = {};
  for (const trip of trips) {
    for (const event of trip.events ?? []) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
  }
  return {
    tripCount,
    distanceKm,
    durationS,
    fuelUsedL,
    idleFuelL,
    avgL100,
    bestL100,
    worstL100,
    maxSpeedKmh,
    estimatedCost,
    avgScore,
    eventCounts,
  };
}
