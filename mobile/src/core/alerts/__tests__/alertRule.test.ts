import { AlertRules, hysteresisStillActive } from "../alertRule";
import type { VehicleSnapshot } from "../../obd/vehicleSnapshot";

function snap(partial: Partial<VehicleSnapshot>): VehicleSnapshot {
  return { timestamp: 0, ...partial };
}

const profile = { tankCapacityL: 60 };

function rule(id: string) {
  const r = AlertRules.builtIn.find((r) => r.id === id);
  if (!r) throw new Error(`missing rule ${id}`);
  return r;
}

describe("AlertRules.builtIn", () => {
  test("coolant.high fires above 105C", () => {
    expect(rule("coolant.high").evaluate(snap({ coolantC: 106 }), profile)).toBe(true);
    expect(rule("coolant.high").evaluate(snap({ coolantC: 100 }), profile)).toBe(false);
  });

  test("coolant.critical fires above 115C", () => {
    expect(rule("coolant.critical").evaluate(snap({ coolantC: 116 }), profile)).toBe(true);
    expect(rule("coolant.critical").evaluate(snap({ coolantC: 110 }), profile)).toBe(false);
  });

  test("fuel.low and fuel.critical thresholds", () => {
    expect(rule("fuel.low").evaluate(snap({ fuelLevelPct: 10 }), profile)).toBe(true);
    expect(rule("fuel.low").evaluate(snap({ fuelLevelPct: 20 }), profile)).toBe(false);
    expect(rule("fuel.critical").evaluate(snap({ fuelLevelPct: 5 }), profile)).toBe(true);
  });

  test("voltage.low only fires while the engine is running", () => {
    expect(rule("voltage.low").evaluate(snap({ rpm: 900, voltage: 11.5 }), profile)).toBe(true);
    expect(rule("voltage.low").evaluate(snap({ rpm: 0, voltage: 11.5 }), profile)).toBe(false);
  });

  test("rpm.coldHigh fires on high revs with a cold engine", () => {
    expect(rule("rpm.coldHigh").evaluate(snap({ rpm: 3500, coolantC: 40 }), profile)).toBe(true);
    expect(rule("rpm.coldHigh").evaluate(snap({ rpm: 3500, coolantC: 90 }), profile)).toBe(false);
  });

  test("dtc.new never self-triggers from the snapshot", () => {
    expect(rule("dtc.new").evaluate(snap({}), profile)).toBe(false);
  });
});

describe("hysteresisStillActive", () => {
  test("loosens the coolant.high threshold by ~5% while dropping", () => {
    // 105 * 0.95 = 99.75 — a value below the hard threshold but above the loosened one stays active
    expect(hysteresisStillActive("coolant.high", snap({ coolantC: 101 }))).toBe(true);
    expect(hysteresisStillActive("coolant.high", snap({ coolantC: 90 }))).toBe(false);
  });

  test("returns false for an unknown rule id", () => {
    expect(hysteresisStillActive("nonexistent", snap({}))).toBe(false);
  });
});
