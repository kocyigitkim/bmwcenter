import { score, scoreTotal } from "../drivingScorer";

describe("drivingScorer", () => {
  test("a clean trip with no events scores near-perfect", () => {
    const b = score({ distanceKm: 50, events: [], overspeedDurationRatio: 0, idleRatio: 0.02, avgL100: 7, baselineL100: 7.5 });
    expect(scoreTotal(b)).toBeGreaterThan(95);
  });

  test("harsh braking events reduce the braking component", () => {
    const clean = score({ distanceKm: 20, events: [], overspeedDurationRatio: 0, idleRatio: 0 });
    const harsh = score({
      distanceKm: 20,
      events: [
        { kind: "harshBrake", t: 0, severity: "severe", speedKmh: 40, magnitude: 1 },
        { kind: "harshBrake", t: 1, severity: "normal", speedKmh: 40, magnitude: 1 },
      ],
      overspeedDurationRatio: 0,
      idleRatio: 0,
    });
    expect(harsh.braking).toBeLessThan(clean.braking);
  });

  test("idle ratio below the 10% floor does not penalize", () => {
    const b = score({ distanceKm: 10, events: [], overspeedDurationRatio: 0, idleRatio: 0.05 });
    expect(b.idle).toBe(10);
  });

  test("idle ratio above the floor reduces the idle component", () => {
    const b = score({ distanceKm: 10, events: [], overspeedDurationRatio: 0, idleRatio: 0.5 });
    expect(b.idle).toBeLessThan(10);
  });

  test("worse-than-baseline consumption reduces efficiency", () => {
    const good = score({ distanceKm: 10, events: [], overspeedDurationRatio: 0, idleRatio: 0, avgL100: 7.5, baselineL100: 7.5 });
    const bad = score({ distanceKm: 10, events: [], overspeedDurationRatio: 0, idleRatio: 0, avgL100: 12, baselineL100: 7.5 });
    expect(bad.efficiency).toBeLessThan(good.efficiency);
  });

  test("scoreTotal clamps to [0, 100]", () => {
    const b = score({
      distanceKm: 0.5,
      events: Array.from({ length: 50 }, (_, i) => ({ kind: "harshBrake" as const, t: i, severity: "severe" as const, speedKmh: 60, magnitude: 2 })),
      overspeedDurationRatio: 1,
      idleRatio: 1,
      avgL100: 40,
      baselineL100: 5,
    });
    expect(scoreTotal(b)).toBeGreaterThanOrEqual(0);
    expect(scoreTotal(b)).toBeLessThanOrEqual(100);
  });
});
