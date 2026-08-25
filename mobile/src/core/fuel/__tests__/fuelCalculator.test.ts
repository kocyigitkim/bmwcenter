import { FuelIntegrationState, fuelRateLh, instantL100, estimatedRangeKm, cost, isValidAvgL100 } from "../fuelCalculator";

/** Drives `s` with constant speed/fuel-rate samples spaced `stepMs` apart (must be
 * < 10_000, the integrator's implausible-gap cutoff) until `totalMs` has elapsed. */
function driveConstant(s: FuelIntegrationState, speedKmh: number, fuelRateLh: number, totalMs: number, stepMs = 5000) {
  for (let t = 0; t <= totalMs; t += stepMs) {
    s.integrate({ t, speedKmh, fuelRateLh });
  }
}

describe("FuelIntegrationState", () => {
  test("ignores the first sample (establishes baseline only)", () => {
    const s = new FuelIntegrationState();
    s.integrate({ t: 0, speedKmh: 0, fuelRateLh: 1 });
    expect(s.fuelUsedL).toBe(0);
    expect(s.distanceKm).toBe(0);
  });

  test("integrates fuel and distance across many samples", () => {
    const s = new FuelIntegrationState();
    driveConstant(s, 60, 6, 3600_000);
    expect(s.fuelUsedL).toBeCloseTo(6, 5);
    expect(s.distanceKm).toBeCloseTo(60, 5);
  });

  test("accumulates idle fuel only below 3 km/h", () => {
    const s = new FuelIntegrationState();
    driveConstant(s, 0, 1.2, 3600_000);
    expect(s.idleFuelL).toBeCloseTo(1.2, 5);
    expect(s.fuelUsedL).toBeCloseTo(1.2, 5);
  });

  test("resets the baseline on an implausible time jump (dt >= 10s)", () => {
    const s = new FuelIntegrationState();
    s.integrate({ t: 0, speedKmh: 60, fuelRateLh: 6 });
    s.integrate({ t: 11_000, speedKmh: 60, fuelRateLh: 6 });
    expect(s.fuelUsedL).toBe(0);
  });

  test("avgL100 is undefined below the plausible distance/fuel floor", () => {
    const s = new FuelIntegrationState();
    expect(s.avgL100).toBeUndefined();
  });

  test("avgL100 computes L/100km once distance and fuel are meaningful", () => {
    const s = new FuelIntegrationState();
    driveConstant(s, 100, 8, 3600_000);
    expect(s.avgL100).toBeCloseTo(8, 5);
  });
});

describe("fuelRateLh", () => {
  test("prefers the direct engine fuel-rate PID when present", () => {
    const rate = fuelRateLh({ timestamp: 0, engineFuelRateLh: 3.5 }, "gasoline", 2.0, 0.85);
    expect(rate).toBeCloseTo(3.5, 5);
  });

  test("falls back to MAF-derived estimate when no direct PID", () => {
    const rate = fuelRateLh({ timestamp: 0, mafGs: 10 }, "gasoline", 2.0, 0.85);
    expect(rate).toBeCloseTo(10 * 0.3288, 5);
  });

  test("returns undefined with no usable signal", () => {
    expect(fuelRateLh({ timestamp: 0 }, "gasoline", 2.0, 0.85)).toBeUndefined();
  });

  test("applies the calibration factor multiplicatively", () => {
    const base = fuelRateLh({ timestamp: 0, engineFuelRateLh: 4 }, "gasoline", 2.0, 0.85, 1.0)!;
    const calibrated = fuelRateLh({ timestamp: 0, engineFuelRateLh: 4 }, "gasoline", 2.0, 0.85, 1.1)!;
    expect(calibrated).toBeCloseTo(base * 1.1, 5);
  });
});

describe("instantL100", () => {
  test("reports idle L/h below 3 km/h", () => {
    expect(instantL100(1.5, 2)).toEqual({ idleLh: 1.5 });
  });

  test("reports L/100km while moving", () => {
    const { l100 } = instantL100(6, 60);
    expect(l100).toBeCloseTo(10, 5);
  });

  test("returns empty object when rate is unknown", () => {
    expect(instantL100(undefined, 60)).toEqual({});
  });
});

describe("estimatedRangeKm", () => {
  test("computes range from fuel level, tank size, and consumption", () => {
    const km = estimatedRangeKm(50, 60, 8);
    expect(km).toBeCloseTo((0.5 * 60 / 8) * 100, 5);
  });

  test("returns undefined when avgL100 is missing or zero", () => {
    expect(estimatedRangeKm(50, 60, undefined)).toBeUndefined();
    expect(estimatedRangeKm(50, 60, 0)).toBeUndefined();
  });
});

describe("misc", () => {
  test("cost multiplies liters by price", () => {
    expect(cost(10, 44.5)).toBeCloseTo(445, 5);
  });

  test("isValidAvgL100 bounds", () => {
    expect(isValidAvgL100(0.4)).toBe(false);
    expect(isValidAvgL100(0.5)).toBe(true);
    expect(isValidAvgL100(60)).toBe(true);
    expect(isValidAvgL100(60.1)).toBe(false);
  });
});
