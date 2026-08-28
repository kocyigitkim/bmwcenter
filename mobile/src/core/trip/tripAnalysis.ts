import type { RoutePoint } from "./routeProjection";

/** One recorded telemetry sample, as stored in trip_samples. */
export interface TripSample {
  t: number;
  speedKmh: number;
  rpm: number;
  fuelRateLh: number;
  throttlePct?: number;
}

export interface TimedRoutePoint extends RoutePoint {
  t: number;
}

export type DrivingClass = "normal" | "harshAccel" | "harshBrake";

export interface HarshEvent {
  kind: "harshAccel" | "harshBrake";
  t: number;
  /** Peak acceleration magnitude over the event, m/s². */
  peakMs2: number;
  speedKmh: number;
}

export interface TrafficStop {
  startT: number;
  endT: number;
  durationS: number;
  /** Nearest recorded location, when the trip carries a route. */
  lat?: number;
  lon?: number;
}

export interface BurnWindow {
  startT: number;
  endT: number;
  fuelL: number;
  avgSpeedKmh: number;
  hadHarshAccel: boolean;
}

export interface RouteSegmentClass {
  /** Index into the route array: segment from point i to point i+1. */
  index: number;
  cls: DrivingClass;
}

export interface TripInsightTip {
  /** i18n key under trip.tip.* */
  key: string;
  params?: Record<string, string | number>;
  severity: "coach" | "positive";
}

export interface TripAnalysis {
  harshEvents: HarshEvent[];
  harshAccelCount: number;
  harshBrakeCount: number;
  stops: TrafficStop[];
  trafficWaitS: number;
  idleFuelL: number;
  /** 0..1 share of total fuel burned while stationary. */
  idleFuelShare: number;
  topBurn?: BurnWindow;
  segments: RouteSegmentClass[];
  tips: TripInsightTip[];
}

// Standard telematics thresholds: ~0.30g for acceleration, ~0.35g for braking.
const HARSH_ACCEL_MS2 = 3.0;
const HARSH_BRAKE_MS2 = -3.5;
/** Ignore sample gaps beyond this — a dropped connection is not a braking event. */
const MAX_SAMPLE_GAP_S = 5;
const STOP_SPEED_KMH = 2;
const MIN_STOP_S = 30;
const BURN_WINDOW_S = 30;
/** How close in time a route point must be to a harsh event to inherit its class. */
const SEGMENT_MATCH_SLACK_MS = 4000;

function kmhToMs(v: number): number {
  return v / 3.6;
}

/** Merges per-sample threshold crossings into events, so five consecutive harsh
 * samples during one overtake count as one event, not five. */
function detectHarshEvents(samples: TripSample[]): HarshEvent[] {
  const events: HarshEvent[] = [];
  let current: HarshEvent | undefined;

  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_S) {
      current = undefined;
      continue;
    }
    const accel = (kmhToMs(b.speedKmh) - kmhToMs(a.speedKmh)) / dt;
    const kind: HarshEvent["kind"] | undefined =
      accel >= HARSH_ACCEL_MS2 ? "harshAccel" : accel <= HARSH_BRAKE_MS2 ? "harshBrake" : undefined;

    if (!kind) {
      current = undefined;
      continue;
    }
    if (current && current.kind === kind && b.t - current.t <= 3000) {
      current.peakMs2 = Math.max(current.peakMs2, Math.abs(accel));
      current.t = b.t;
      current.speedKmh = Math.max(current.speedKmh, b.speedKmh);
    } else {
      current = { kind, t: b.t, peakMs2: Math.abs(accel), speedKmh: b.speedKmh };
      events.push(current);
    }
  }
  return events;
}

function detectStops(samples: TripSample[], route: TimedRoutePoint[]): TrafficStop[] {
  const stops: TrafficStop[] = [];
  let start: number | undefined;
  let prevT: number | undefined;

  const close = (endT: number) => {
    if (start == null) return;
    const durationS = (endT - start) / 1000;
    if (durationS >= MIN_STOP_S) {
      const mid = start + (endT - start) / 2;
      const nearest = route.length
        ? route.reduce((best, p) => (Math.abs(p.t - mid) < Math.abs(best.t - mid) ? p : best))
        : undefined;
      stops.push({ startT: start, endT, durationS, lat: nearest?.lat, lon: nearest?.lon });
    }
    start = undefined;
  };

  for (const s of samples) {
    const gap = prevT != null ? (s.t - prevT) / 1000 : 0;
    if (gap > MAX_SAMPLE_GAP_S * 4) close(prevT!);
    const stopped = s.speedKmh < STOP_SPEED_KMH && s.rpm > 300;
    if (stopped) {
      if (start == null) start = s.t;
    } else {
      close(s.t);
    }
    prevT = s.t;
  }
  if (prevT != null) close(prevT);
  return stops;
}

function integrateFuel(samples: TripSample[], predicate: (s: TripSample) => boolean): number {
  let liters = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0 || dt > MAX_SAMPLE_GAP_S) continue;
    if (predicate(a)) liters += (a.fuelRateLh / 3600) * dt;
  }
  return liters;
}

function findTopBurnWindow(samples: TripSample[], harshEvents: HarshEvent[]): BurnWindow | undefined {
  if (samples.length < 2) return undefined;
  let best: BurnWindow | undefined;

  for (let i = 0; i < samples.length; i++) {
    const startT = samples[i]!.t;
    const endT = startT + BURN_WINDOW_S * 1000;
    let fuel = 0;
    let speedSum = 0;
    let count = 0;
    for (let j = i; j < samples.length - 1 && samples[j]!.t < endT; j++) {
      const a = samples[j]!;
      const b = samples[j + 1]!;
      const dt = (b.t - a.t) / 1000;
      if (dt <= 0 || dt > MAX_SAMPLE_GAP_S) break;
      fuel += (a.fuelRateLh / 3600) * dt;
      speedSum += a.speedKmh;
      count++;
    }
    if (count < 3) continue;
    if (!best || fuel > best.fuelL) {
      best = {
        startT,
        endT: Math.min(endT, samples[samples.length - 1]!.t),
        fuelL: fuel,
        avgSpeedKmh: speedSum / count,
        hadHarshAccel: harshEvents.some(
          (e) => e.kind === "harshAccel" && e.t >= startT && e.t <= endT
        ),
      };
    }
  }
  return best;
}

function classifySegments(route: TimedRoutePoint[], events: HarshEvent[]): RouteSegmentClass[] {
  const out: RouteSegmentClass[] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const t0 = route[i]!.t - SEGMENT_MATCH_SLACK_MS;
    const t1 = route[i + 1]!.t + SEGMENT_MATCH_SLACK_MS;
    const hit = events.find((e) => e.t >= t0 && e.t <= t1);
    out.push({ index: i, cls: hit ? hit.kind : "normal" });
  }
  return out;
}

function buildTips(a: Omit<TripAnalysis, "tips">, distanceKm: number, totalFuelL: number): TripInsightTip[] {
  const tips: TripInsightTip[] = [];
  const per10km = distanceKm > 0 ? 10 / distanceKm : 0;

  if (a.idleFuelShare >= 0.15 && a.idleFuelL >= 0.15) {
    tips.push({
      key: "trip.tip.idle",
      params: { pct: Math.round(a.idleFuelShare * 100), liters: a.idleFuelL.toFixed(2) },
      severity: "coach",
    });
  }
  if (distanceKm >= 2 && a.harshAccelCount * per10km >= 2) {
    tips.push({ key: "trip.tip.accel", params: { count: a.harshAccelCount }, severity: "coach" });
  }
  if (distanceKm >= 2 && a.harshBrakeCount * per10km >= 2) {
    tips.push({ key: "trip.tip.brake", params: { count: a.harshBrakeCount }, severity: "coach" });
  }
  if (a.topBurn && totalFuelL > 0 && a.topBurn.fuelL / totalFuelL >= 0.12 && a.topBurn.hadHarshAccel) {
    tips.push({
      key: "trip.tip.burnAccel",
      params: { pct: Math.round((a.topBurn.fuelL / totalFuelL) * 100) },
      severity: "coach",
    });
  }
  if (a.trafficWaitS >= 10 * 60) {
    tips.push({
      key: "trip.tip.traffic",
      params: { minutes: Math.round(a.trafficWaitS / 60) },
      severity: "coach",
    });
  }
  if (tips.length === 0 && distanceKm >= 2) {
    tips.push({ key: "trip.tip.smooth", severity: "positive" });
  }
  return tips;
}

/** Derives the driving-behaviour picture of a finished trip from its recorded
 * samples: where the driver was harsh, how long they sat in traffic, where the
 * fuel actually went — and what to tell them about it. */
export function analyzeTrip(
  samples: TripSample[],
  route: TimedRoutePoint[],
  totals: { distanceKm: number; fuelUsedL: number }
): TripAnalysis {
  const harshEvents = detectHarshEvents(samples);
  const stops = detectStops(samples, route);
  const trafficWaitS = stops.reduce((s, x) => s + x.durationS, 0);
  const idleFuelL = integrateFuel(samples, (s) => s.speedKmh < STOP_SPEED_KMH && s.rpm > 300);
  const totalFuel = totals.fuelUsedL > 0 ? totals.fuelUsedL : integrateFuel(samples, () => true);
  const idleFuelShare = totalFuel > 0 ? Math.min(idleFuelL / totalFuel, 1) : 0;
  const topBurn = findTopBurnWindow(samples, harshEvents);
  const segments = classifySegments(route, harshEvents);

  const partial = {
    harshEvents,
    harshAccelCount: harshEvents.filter((e) => e.kind === "harshAccel").length,
    harshBrakeCount: harshEvents.filter((e) => e.kind === "harshBrake").length,
    stops,
    trafficWaitS,
    idleFuelL,
    idleFuelShare,
    topBurn,
    segments,
  };
  return { ...partial, tips: buildTips(partial, totals.distanceKm, totalFuel) };
}
