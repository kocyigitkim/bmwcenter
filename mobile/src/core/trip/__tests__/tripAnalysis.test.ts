import { analyzeTrip, type TimedRoutePoint, type TripSample } from "../tripAnalysis";

const T0 = 1_000_000_000_000;

function sample(sec: number, speedKmh: number, over: Partial<TripSample> = {}): TripSample {
  return { t: T0 + sec * 1000, speedKmh, rpm: 1500, fuelRateLh: 5, ...over };
}

/** Constant-speed cruise. */
function cruise(fromSec: number, toSec: number, speed: number): TripSample[] {
  const out: TripSample[] = [];
  for (let s = fromSec; s <= toSec; s++) out.push(sample(s, speed));
  return out;
}

describe("harsh event detection", () => {
  it("finds a hard acceleration and reports it once, not per-sample", () => {
    // 0->72 km/h over 5s = 4 m/s² sustained: five consecutive harsh samples.
    const samples = [
      ...cruise(0, 10, 0).map((s) => ({ ...s, rpm: 800 })),
      ...[1, 2, 3, 4, 5].map((i) => sample(10 + i, i * 14.4)),
      ...cruise(16, 40, 72),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 5, fuelUsedL: 0.5 });
    expect(a.harshAccelCount).toBe(1);
    expect(a.harshBrakeCount).toBe(0);
    expect(a.harshEvents[0]!.peakMs2).toBeCloseTo(4, 1);
  });

  it("finds hard braking", () => {
    // 90->18 km/h over 5s = -4 m/s².
    const samples = [
      ...cruise(0, 20, 90),
      ...[1, 2, 3, 4, 5].map((i) => sample(20 + i, 90 - i * 14.4)),
      ...cruise(26, 40, 18),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 5, fuelUsedL: 0.5 });
    expect(a.harshBrakeCount).toBe(1);
    expect(a.harshAccelCount).toBe(0);
  });

  it("does not treat a data gap as an event", () => {
    // 90 km/h, 60s dropout, then 0 km/h — dv/dt over the gap is meaningless.
    const samples = [...cruise(0, 10, 90), sample(70, 0), ...cruise(71, 80, 0)];
    const a = analyzeTrip(samples, [], { distanceKm: 5, fuelUsedL: 0.5 });
    expect(a.harshBrakeCount).toBe(0);
  });

  it("stays quiet for smooth driving", () => {
    // 0->50 km/h over 15s ≈ 0.9 m/s².
    const ramp = Array.from({ length: 15 }, (_, i) => sample(i, (i + 1) * (50 / 15)));
    const a = analyzeTrip([...ramp, ...cruise(15, 60, 50)], [], { distanceKm: 5, fuelUsedL: 0.4 });
    expect(a.harshAccelCount).toBe(0);
    expect(a.harshBrakeCount).toBe(0);
  });
});

describe("traffic stops", () => {
  it("counts only stops longer than 30s and sums the wait", () => {
    const samples = [
      ...cruise(0, 10, 50),
      ...cruise(11, 71, 0), // 60s stop (engine running)
      ...cruise(72, 90, 50),
      ...cruise(91, 101, 0), // 10s stop — below threshold
      ...cruise(102, 120, 50),
      ...cruise(121, 166, 0), // 45s stop
      ...cruise(167, 180, 50),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 4, fuelUsedL: 0.4 });
    expect(a.stops).toHaveLength(2);
    expect(a.trafficWaitS).toBeGreaterThanOrEqual(100);
    expect(a.trafficWaitS).toBeLessThanOrEqual(112);
  });

  it("locates a stop at the nearest route point", () => {
    const samples = [...cruise(0, 10, 50), ...cruise(11, 71, 0), ...cruise(72, 80, 50)];
    const route: TimedRoutePoint[] = [
      { lat: 41.0, lon: 29.0, t: T0 },
      { lat: 41.01, lon: 29.01, t: T0 + 40_000 },
      { lat: 41.02, lon: 29.02, t: T0 + 80_000 },
    ];
    const a = analyzeTrip(samples, route, { distanceKm: 2, fuelUsedL: 0.2 });
    expect(a.stops[0]!.lat).toBeCloseTo(41.01);
  });

  it("ignores a stop with the engine off (trip ended, not traffic)", () => {
    const samples = [
      ...cruise(0, 10, 50),
      ...cruise(11, 71, 0).map((s) => ({ ...s, rpm: 0 })),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 2, fuelUsedL: 0.2 });
    expect(a.stops).toHaveLength(0);
  });
});

describe("fuel attribution", () => {
  it("computes idle fuel share", () => {
    // 100s moving at 5 L/h + 100s idling at 1.8 L/h.
    const samples = [
      ...cruise(0, 100, 60),
      ...cruise(101, 201, 0).map((s) => ({ ...s, fuelRateLh: 1.8 })),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 2, fuelUsedL: 0 });
    // idle: 100s * 1.8/3600 = 0.05 L; moving: 100s * 5/3600 ≈ 0.139 L.
    expect(a.idleFuelL).toBeCloseTo(0.05, 2);
    expect(a.idleFuelShare).toBeGreaterThan(0.2);
    expect(a.idleFuelShare).toBeLessThan(0.32);
  });

  it("finds the heaviest 30-second burn window and links it to harsh acceleration", () => {
    const samples = [
      ...cruise(0, 60, 50),
      // 20 L/h burst with a hard pull inside it.
      ...[1, 2, 3, 4, 5].map((i) => sample(60 + i, 50 + i * 15, { fuelRateLh: 20 })),
      ...cruise(66, 90, 120).map((s) => ({ ...s, fuelRateLh: 20 })),
      ...cruise(91, 150, 60),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 8, fuelUsedL: 0.6 });
    expect(a.topBurn).toBeDefined();
    expect(a.topBurn!.hadHarshAccel).toBe(true);
    expect(a.topBurn!.startT).toBeGreaterThanOrEqual(T0 + 55_000);
  });
});

describe("route segment classification", () => {
  it("colors segments near a harsh event and leaves the rest normal", () => {
    const samples = [
      ...cruise(0, 30, 50),
      ...[1, 2, 3, 4, 5].map((i) => sample(30 + i, 50 - i * 14.4 >= 0 ? 50 - i * 9 : 5)),
      ...cruise(36, 60, 10),
    ];
    // Make the mid samples an actual harsh brake: 90 -> 18 in 5s.
    const harsh = [
      ...cruise(0, 30, 90),
      ...[1, 2, 3, 4, 5].map((i) => sample(30 + i, 90 - i * 14.4)),
      ...cruise(36, 60, 18),
    ];
    const route: TimedRoutePoint[] = Array.from({ length: 7 }, (_, i) => ({
      lat: 41 + i * 0.01,
      lon: 29,
      t: T0 + i * 10_000,
    }));
    const a = analyzeTrip(harsh, route, { distanceKm: 3, fuelUsedL: 0.3 });
    const classes = a.segments.map((s) => s.cls);
    expect(classes).toContain("harshBrake");
    expect(classes.filter((c) => c === "normal").length).toBeGreaterThan(0);
    // The event happened ~t=30-35s → segment index 2-3, not the first or last.
    expect(a.segments[0]!.cls).toBe("normal");
    void samples;
  });
});

describe("tips", () => {
  it("suggests idling guidance when idle share is high", () => {
    const samples = [
      ...cruise(0, 100, 40),
      ...cruise(101, 400, 0).map((s) => ({ ...s, fuelRateLh: 2 })),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 3, fuelUsedL: 0 });
    expect(a.tips.some((t) => t.key === "trip.tip.idle")).toBe(true);
  });

  it("congratulates a clean trip", () => {
    const a = analyzeTrip(cruise(0, 300, 60), [], { distanceKm: 6, fuelUsedL: 0.4 });
    expect(a.tips).toHaveLength(1);
    expect(a.tips[0]!.key).toBe("trip.tip.smooth");
    expect(a.tips[0]!.severity).toBe("positive");
  });

  it("reports traffic when the wait is long", () => {
    const samples = [
      ...cruise(0, 60, 50),
      ...cruise(61, 700, 0), // ~10.6 min stopped
      ...cruise(701, 760, 50),
    ];
    const a = analyzeTrip(samples, [], { distanceKm: 3, fuelUsedL: 0.5 });
    expect(a.tips.some((t) => t.key === "trip.tip.traffic")).toBe(true);
  });
});
