import {
  compareToRoute,
  distanceKmBetween,
  findSameRoute,
  isSameRoute,
  startOfWeek,
  trendDirection,
  verdictFor,
  weeklyTrend,
  type RouteTrip,
} from "../routeMatching";

const HOME = { lat: 41.0082, lon: 28.9784 };
const WORK = { lat: 41.0451, lon: 29.0094 };

let counter = 0;

function trip(over: Partial<RouteTrip> = {}): RouteTrip {
  counter += 1;
  return {
    id: `trip-${counter}`,
    startedAt: Date.UTC(2026, 5, 1, 8),
    startLatitude: HOME.lat,
    startLongitude: HOME.lon,
    endLatitude: WORK.lat,
    endLongitude: WORK.lon,
    distanceKm: 12,
    durationS: 1800,
    avgL100: 8,
    avgSpeedKmh: 24,
    scoreTotal: 80,
    ...over,
  };
}

/** Roughly metres of latitude, for nudging a point a known distance. */
function offsetLat(lat: number, metres: number): number {
  return lat + metres / 111_320;
}

describe("distanceKmBetween", () => {
  it("measures a known separation", () => {
    // Istanbul home to work, about 4.5 km apart in a straight line.
    const km = distanceKmBetween(HOME.lat, HOME.lon, WORK.lat, WORK.lon);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });

  it("is zero for the same point", () => {
    expect(distanceKmBetween(HOME.lat, HOME.lon, HOME.lat, HOME.lon)).toBeCloseTo(0, 6);
  });
});

describe("isSameRoute", () => {
  it("matches two drives between the same places", () => {
    expect(isSameRoute(trip(), trip())).toBe(true);
  });

  it("tolerates parking a couple of hundred metres away", () => {
    const other = trip({ startLatitude: offsetLat(HOME.lat, 200) });
    expect(isSameRoute(trip(), other)).toBe(true);
  });

  it("rejects a drive that started somewhere else entirely", () => {
    const other = trip({ startLatitude: offsetLat(HOME.lat, 3000) });
    expect(isSameRoute(trip(), other)).toBe(false);
  });

  it("does not treat the drive home as the drive to work", () => {
    // Reversing the ends is a different journey with different traffic.
    const home = trip({
      startLatitude: WORK.lat,
      startLongitude: WORK.lon,
      endLatitude: HOME.lat,
      endLongitude: HOME.lon,
    });
    expect(isSameRoute(trip(), home)).toBe(false);
  });

  it("rejects a long detour between the same two places", () => {
    expect(isSameRoute(trip({ distanceKm: 12 }), trip({ distanceKm: 20 }))).toBe(false);
    expect(isSameRoute(trip({ distanceKm: 12 }), trip({ distanceKm: 13.5 }))).toBe(true);
  });

  it("ignores trips with no recorded position", () => {
    expect(isSameRoute(trip(), trip({ startLatitude: null }))).toBe(false);
    expect(isSameRoute(trip({ endLongitude: null }), trip())).toBe(false);
  });

  it("ignores manoeuvres too short to be a journey", () => {
    expect(isSameRoute(trip({ distanceKm: 0.4 }), trip({ distanceKm: 0.4 }))).toBe(false);
  });
});

describe("findSameRoute", () => {
  it("never matches a trip against itself", () => {
    const subject = trip();
    expect(findSameRoute(subject, [subject])).toEqual([]);
  });

  it("picks out the matching drives and leaves the rest", () => {
    const subject = trip();
    const matching = trip();
    const elsewhere = trip({ endLatitude: offsetLat(WORK.lat, 5000) });
    expect(findSameRoute(subject, [matching, elsewhere]).map((t) => t.id)).toEqual([matching.id]);
  });
});

describe("compareToRoute", () => {
  it("says nothing when there is no usual to compare against", () => {
    expect(compareToRoute(trip(), [])).toBeUndefined();
    // One earlier drive is an anecdote, not a baseline.
    expect(compareToRoute(trip(), [trip()])).toBeUndefined();
  });

  it("reports how this drive sits against the usual", () => {
    const subject = trip({ avgL100: 7, durationS: 1600 });
    const comparison = compareToRoute(subject, [
      trip({ avgL100: 8, durationS: 1800 }),
      trip({ avgL100: 8, durationS: 1800 }),
    ]);
    expect(comparison).toBeDefined();
    expect(comparison!.sampleCount).toBe(2);
    expect(comparison!.usualL100).toBeCloseTo(8, 5);
    expect(comparison!.consumptionDelta).toBeCloseTo(-0.125, 5);
    expect(comparison!.durationDelta).toBeCloseTo(-0.111, 2);
  });

  it("recognises a personal best on the route", () => {
    const comparison = compareToRoute(trip({ avgL100: 6 }), [
      trip({ avgL100: 7.5 }),
      trip({ avgL100: 8 }),
    ]);
    expect(comparison!.isBest).toBe(true);
    expect(comparison!.bestL100).toBe(7.5);
  });

  it("does not call a tie a best", () => {
    const comparison = compareToRoute(trip({ avgL100: 7.5 }), [
      trip({ avgL100: 7.5 }),
      trip({ avgL100: 8 }),
    ]);
    expect(comparison!.isBest).toBe(false);
  });

  it("ignores earlier drives with no consumption figure", () => {
    const comparison = compareToRoute(trip(), [
      trip({ avgL100: 0 }),
      trip({ avgL100: 0 }),
      trip({ avgL100: 8 }),
    ]);
    // Only one usable sample is left, which is below the minimum.
    expect(comparison).toBeUndefined();
  });

  it("says nothing about a drive with no consumption figure of its own", () => {
    expect(compareToRoute(trip({ avgL100: 0 }), [trip(), trip()])).toBeUndefined();
  });
});

describe("verdictFor", () => {
  it("treats small differences as ordinary variation", () => {
    expect(verdictFor(0.02)).toBe("typical");
    expect(verdictFor(-0.04)).toBe("typical");
  });

  it("calls out a real difference in either direction", () => {
    expect(verdictFor(-0.12)).toBe("better");
    expect(verdictFor(0.18)).toBe("worse");
  });
});

describe("startOfWeek", () => {
  it("returns the Monday of that week at local midnight", () => {
    // 2026-06-03 is a Wednesday.
    const monday = new Date(startOfWeek(new Date(2026, 5, 3, 15, 30).getTime()));
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(1);
    expect(monday.getHours()).toBe(0);
  });

  it("puts Sunday in the week that began six days earlier", () => {
    // 2026-06-07 is a Sunday; its week started Monday the 1st.
    const monday = new Date(startOfWeek(new Date(2026, 5, 7, 12).getTime()));
    expect(monday.getDate()).toBe(1);
  });
});

describe("weeklyTrend", () => {
  const now = new Date(2026, 5, 10, 12).getTime();

  it("returns one point per week, oldest first, including empty ones", () => {
    const points = weeklyTrend([], 4, now);
    expect(points).toHaveLength(4);
    expect(points[0]!.weekStart).toBeLessThan(points[3]!.weekStart);
    expect(points.every((p) => p.tripCount === 0)).toBe(true);
  });

  it("weights consumption by distance, not by trip count", () => {
    const week = new Date(2026, 5, 9, 8).getTime();
    const points = weeklyTrend(
      [
        trip({ startedAt: week, distanceKm: 100, avgL100: 6 }),
        trip({ startedAt: week, distanceKm: 2, avgL100: 20 }),
      ],
      4,
      now
    );
    const latest = points[points.length - 1]!;
    // A plain mean would give 13; weighting by distance keeps it near the long run.
    expect(latest.avgL100).toBeGreaterThan(6);
    expect(latest.avgL100).toBeLessThan(7);
  });

  it("leaves the score undefined for a week with no scored trips", () => {
    const week = new Date(2026, 5, 9, 8).getTime();
    const points = weeklyTrend([trip({ startedAt: week, scoreTotal: null })], 4, now);
    expect(points[points.length - 1]!.avgScore).toBeUndefined();
  });

  it("drops trips older than the window", () => {
    const ancient = new Date(2025, 0, 1).getTime();
    const points = weeklyTrend([trip({ startedAt: ancient })], 4, now);
    expect(points.every((p) => p.tripCount === 0)).toBe(true);
  });
});

describe("trendDirection", () => {
  it("needs enough weeks before claiming a direction", () => {
    expect(trendDirection([8, 8])).toBeUndefined();
    expect(trendDirection([8, 8, 8])).toBeUndefined();
  });

  it("reports improvement and regression", () => {
    expect(trendDirection([10, 10, 8, 8])!).toBeCloseTo(-0.2, 5);
    expect(trendDirection([8, 8, 10, 10])!).toBeCloseTo(0.25, 5);
  });

  it("skips empty weeks rather than reading a holiday as improvement", () => {
    const withGaps = [10, undefined, 10, undefined, 8, 8];
    expect(trendDirection(withGaps)!).toBeCloseTo(-0.2, 5);
  });

  it("says nothing when everything is zero or missing", () => {
    expect(trendDirection([undefined, undefined])).toBeUndefined();
    expect(trendDirection([0, 0, 0, 0])).toBeUndefined();
  });
});
