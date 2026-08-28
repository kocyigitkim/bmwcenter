/**
 * Recognising a drive you have done before, and saying how this one compared.
 *
 * A single trip's consumption figure means little on its own — 7.8 L/100km is
 * good on a cold city crawl and poor on a summer motorway run. Against the same
 * commute driven twenty times, it means something.
 *
 * Matching is deliberately crude: start near, end near, similar distance. Two
 * drives between the same two places are the same route for this purpose even
 * if one took a different turn, because that is how a driver thinks about it.
 * Nothing here tries to match the shape of the path, which would need far more
 * data than the app keeps and would still disagree with the user's own idea of
 * "my usual route".
 */

export interface RouteTrip {
  id: string;
  startedAt: number;
  startLatitude: number | null;
  startLongitude: number | null;
  endLatitude: number | null;
  endLongitude: number | null;
  distanceKm: number;
  durationS: number;
  avgL100: number;
  avgSpeedKmh: number;
  scoreTotal: number | null;
}

/** Two points within this are the same place: a car park, a street, a driveway. */
export const SAME_PLACE_KM = 0.35;
/** Routes differing by more than this in length are different routes. */
export const DISTANCE_TOLERANCE = 0.25;
/** Below this a "route" is a manoeuvre, not a journey worth comparing. */
export const MIN_ROUTE_KM = 1;

const EARTH_RADIUS_KM = 6371;

export function distanceKmBetween(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function hasEnds(trip: RouteTrip): boolean {
  return (
    trip.startLatitude != null &&
    trip.startLongitude != null &&
    trip.endLatitude != null &&
    trip.endLongitude != null
  );
}

/**
 * Whether two trips are the same journey.
 *
 * The reverse direction is deliberately not matched: the drive home is not the
 * drive to work — different traffic, different gradient, often a different
 * consumption figure — and averaging them together would flatten exactly the
 * difference the comparison exists to show.
 */
export function isSameRoute(a: RouteTrip, b: RouteTrip): boolean {
  if (!hasEnds(a) || !hasEnds(b)) return false;
  if (a.distanceKm < MIN_ROUTE_KM || b.distanceKm < MIN_ROUTE_KM) return false;

  const startsTogether =
    distanceKmBetween(a.startLatitude!, a.startLongitude!, b.startLatitude!, b.startLongitude!) <=
    SAME_PLACE_KM;
  const endsTogether =
    distanceKmBetween(a.endLatitude!, a.endLongitude!, b.endLatitude!, b.endLongitude!) <=
    SAME_PLACE_KM;
  if (!startsTogether || !endsTogether) return false;

  // A detour long enough to change the distance materially is a different drive.
  const longer = Math.max(a.distanceKm, b.distanceKm);
  return Math.abs(a.distanceKm - b.distanceKm) / longer <= DISTANCE_TOLERANCE;
}

export function findSameRoute(trip: RouteTrip, candidates: RouteTrip[]): RouteTrip[] {
  return candidates.filter((other) => other.id !== trip.id && isSameRoute(trip, other));
}

export interface RouteComparison {
  /** How many earlier drives of this route the comparison is based on. */
  sampleCount: number;
  usualL100: number;
  usualDurationS: number;
  usualSpeedKmh: number;
  /** Signed fraction against the usual: -0.12 is 12 % less fuel than normal. */
  consumptionDelta: number;
  durationDelta: number;
  /** Best consumption ever recorded on this route, and whether this drive beat it. */
  bestL100: number;
  isBest: boolean;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * How this drive compares with the usual for its route.
 *
 * Undefined when there is nothing to compare against — one previous drive is
 * not "usual", it is an anecdote, and presenting it as a baseline would put a
 * confident percentage on pure noise.
 */
export function compareToRoute(
  trip: RouteTrip,
  previous: RouteTrip[],
  minimumSamples = 2
): RouteComparison | undefined {
  const usable = previous.filter((p) => p.avgL100 > 0 && p.durationS > 0);
  if (usable.length < minimumSamples) return undefined;
  if (!(trip.avgL100 > 0) || !(trip.durationS > 0)) return undefined;

  const usualL100 = mean(usable.map((p) => p.avgL100));
  const usualDurationS = mean(usable.map((p) => p.durationS));
  const usualSpeedKmh = mean(usable.map((p) => p.avgSpeedKmh));
  const bestL100 = Math.min(...usable.map((p) => p.avgL100));

  return {
    sampleCount: usable.length,
    usualL100,
    usualDurationS,
    usualSpeedKmh,
    consumptionDelta: usualL100 > 0 ? (trip.avgL100 - usualL100) / usualL100 : 0,
    durationDelta: usualDurationS > 0 ? (trip.durationS - usualDurationS) / usualDurationS : 0,
    bestL100,
    isBest: trip.avgL100 < bestL100,
  };
}

/** Deltas smaller than this are noise, not news. */
export const NOTABLE_DELTA = 0.05;

export type ComparisonVerdict = "better" | "worse" | "typical";

export function verdictFor(delta: number, threshold = NOTABLE_DELTA): ComparisonVerdict {
  if (delta <= -threshold) return "better";
  if (delta >= threshold) return "worse";
  return "typical";
}

// --- weekly trends ---------------------------------------------------------

export interface TrendPoint {
  /** Start of the week, local midnight on Monday. */
  weekStart: number;
  tripCount: number;
  distanceKm: number;
  avgL100: number;
  avgSpeedKmh: number;
  avgScore?: number;
}

/** Local midnight on the Monday of that week. */
export function startOfWeek(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  // getDay() is 0 for Sunday, which belongs to the week that began six days ago.
  const daysSinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - daysSinceMonday);
  return d.getTime();
}

/**
 * Weekly aggregates, oldest first.
 *
 * Consumption is weighted by distance rather than averaged per trip: a
 * three-kilometre cold start should not count as much as a hundred-kilometre
 * run when describing how the week went.
 */
export function weeklyTrend(trips: RouteTrip[], weeks = 8, now = Date.now()): TrendPoint[] {
  const buckets = new Map<number, RouteTrip[]>();
  const earliest = startOfWeek(now) - (weeks - 1) * 7 * 86_400_000;

  for (const trip of trips) {
    const week = startOfWeek(trip.startedAt);
    if (week < earliest) continue;
    const list = buckets.get(week) ?? [];
    list.push(trip);
    buckets.set(week, list);
  }

  const points: TrendPoint[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const weekStart = earliest + i * 7 * 86_400_000;
    const inWeek = buckets.get(weekStart) ?? [];
    const distanceKm = inWeek.reduce((sum, t) => sum + t.distanceKm, 0);

    const fuelling = inWeek.filter((t) => t.avgL100 > 0 && t.distanceKm > 0);
    const fuelKm = fuelling.reduce((sum, t) => sum + t.distanceKm, 0);
    const avgL100 =
      fuelKm > 0 ? fuelling.reduce((sum, t) => sum + t.avgL100 * t.distanceKm, 0) / fuelKm : 0;

    const moving = inWeek.filter((t) => t.avgSpeedKmh > 0);
    const scored = inWeek.filter((t) => t.scoreTotal != null);

    points.push({
      weekStart,
      tripCount: inWeek.length,
      distanceKm,
      avgL100,
      avgSpeedKmh: moving.length > 0 ? mean(moving.map((t) => t.avgSpeedKmh)) : 0,
      avgScore: scored.length > 0 ? mean(scored.map((t) => t.scoreTotal!)) : undefined,
    });
  }
  return points;
}

/**
 * Direction of travel across a trend, as a signed fraction.
 *
 * Compares the most recent weeks that have data against the ones before them,
 * skipping empty weeks entirely — a fortnight on holiday is not an improvement
 * in fuel consumption.
 */
export function trendDirection(points: Array<number | undefined>): number | undefined {
  const values = points.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (values.length < 4) return undefined;
  const half = Math.floor(values.length / 2);
  const older = mean(values.slice(0, half));
  const recent = mean(values.slice(values.length - half));
  if (!(older > 0)) return undefined;
  return (recent - older) / older;
}
