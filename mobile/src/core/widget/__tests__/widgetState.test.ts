import { buildWidgetState, isRecentEnough, isWorthWriting, type WidgetInput } from "../widgetState";

const NOW = Date.UTC(2026, 6, 2, 10);

function input(over: Partial<WidgetInput> = {}): WidgetInput {
  return { now: NOW, vehicleName: "BMW 320i", ...over };
}

describe("buildWidgetState", () => {
  it("leads with the fuel level when parked", () => {
    const state = buildWidgetState(
      input({ fuelLevelPct: 62, fuelLevelText: "62%", rangeText: "480 km" })
    );
    expect(state.primary).toBe("62%");
    expect(state.secondary).toBe("480 km");
    expect(state.fuelLevelPct).toBe(62);
    expect(state.recording).toBe(false);
  });

  it("leads with the drive in progress instead", () => {
    const state = buildWidgetState(
      input({
        fuelLevelText: "62%",
        rangeText: "480 km",
        live: { distanceText: "12.4 km", consumptionText: "7.8 L/100km" },
      })
    );
    expect(state.primary).toBe("12.4 km");
    expect(state.secondary).toBe("7.8 L/100km");
    expect(state.recording).toBe(true);
  });

  it("falls back to the odometer for a car that reports no fuel level", () => {
    const state = buildWidgetState(input({ odometerText: "152340 km" }));
    expect(state.primary).toBe("--");
    expect(state.secondary).toBe("152340 km");
    expect(state.fuelLevelPct).toBeNull();
  });

  it("prefers range over the odometer when both are known", () => {
    const state = buildWidgetState(input({ rangeText: "480 km", odometerText: "152340 km" }));
    expect(state.secondary).toBe("480 km");
  });

  it("clamps and rounds the bar, and never invents a level", () => {
    expect(buildWidgetState(input({ fuelLevelPct: 62.6 })).fuelLevelPct).toBe(63);
    expect(buildWidgetState(input({ fuelLevelPct: -4 })).fuelLevelPct).toBe(0);
    expect(buildWidgetState(input({ fuelLevelPct: 140 })).fuelLevelPct).toBe(100);
    expect(buildWidgetState(input({ fuelLevelPct: Number.NaN })).fuelLevelPct).toBeNull();
    expect(buildWidgetState(input()).fuelLevelPct).toBeNull();
  });

  it("summarises the last drive, and stays empty when there was none", () => {
    const withTrip = buildWidgetState(
      input({ lastTrip: { distanceText: "23.1 km", consumptionText: "6.4 L/100km", endedAt: NOW } })
    );
    expect(withTrip.trip).toContain("23.1 km");
    expect(withTrip.trip).toContain("6.4 L/100km");
    expect(buildWidgetState(input()).trip).toBe("");
  });

  it("omits a missing consumption figure rather than leaving a dangling separator", () => {
    const state = buildWidgetState(input({ lastTrip: { distanceText: "23.1 km", endedAt: NOW } }));
    expect(state.trip).toBe("23.1 km");
  });

  it("falls back to a name when the vehicle has none", () => {
    expect(buildWidgetState(input({ vehicleName: "" })).vehicleName).toBe("QuickCar");
  });
});

describe("isWorthWriting", () => {
  const base = buildWidgetState(input({ fuelLevelPct: 62, fuelLevelText: "62%" }));

  it("always writes the first time", () => {
    expect(isWorthWriting(undefined, base)).toBe(true);
  });

  it("skips a write when nothing visible changed", () => {
    const same = buildWidgetState(input({ fuelLevelPct: 62, fuelLevelText: "62%" }));
    expect(isWorthWriting(base, same)).toBe(false);
  });

  it("ignores a fuel change too small to move the bar", () => {
    const nudged = buildWidgetState(input({ fuelLevelPct: 62.2, fuelLevelText: "62%" }));
    expect(isWorthWriting(base, nudged)).toBe(false);
  });

  it("writes when the bar or any line actually changes", () => {
    expect(
      isWorthWriting(base, buildWidgetState(input({ fuelLevelPct: 61, fuelLevelText: "62%" })))
    ).toBe(true);
    expect(
      isWorthWriting(base, buildWidgetState(input({ fuelLevelPct: 62, fuelLevelText: "61%" })))
    ).toBe(true);
  });

  it("writes when recording starts", () => {
    const recording = buildWidgetState(input({ live: { distanceText: "0.2 km" } }));
    expect(isWorthWriting(base, recording)).toBe(true);
  });
});

describe("isRecentEnough", () => {
  it("keeps a drive from this week and drops one from last month", () => {
    expect(isRecentEnough(NOW - 3 * 86_400_000, NOW)).toBe(true);
    expect(isRecentEnough(NOW - 40 * 86_400_000, NOW)).toBe(false);
  });
});
