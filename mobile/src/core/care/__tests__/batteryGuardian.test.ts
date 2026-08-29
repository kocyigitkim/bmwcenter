import { emptyCareContext } from "../careTypes";
import type { CareContext } from "../careTypes";
import type { VehicleSnapshot } from "../../obd/vehicleSnapshot";

jest.mock("../../storage/db", () => ({
  db: { insert: () => ({ values: () => ({ catch: () => undefined }) }) },
}));

const START = 1_700_000_000_000;

type Guardian = typeof import("../batteryGuardian").batteryGuardian;
let batteryGuardian: Guardian;

beforeEach(() => {
  jest.isolateModules(() => {
    batteryGuardian = require("../batteryGuardian").batteryGuardian as Guardian;
  });
});

function context(over: Partial<CareContext> = {}): CareContext {
  return { ...emptyCareContext(START), ambientC: 20, ...over };
}

function snapshot(over: Partial<VehicleSnapshot> = {}): VehicleSnapshot {
  return { timestamp: START, rpm: 0, voltage: 12.6, ...over };
}

/** Sits at rest at a given voltage, then cranks — the moment the guardian judges. */
function crankAfterResting(restingVolts: number, now = START) {
  for (let i = 0; i < 6; i += 1) {
    batteryGuardian.evaluate(snapshot({ rpm: 0, voltage: restingVolts }), { ...context(), now: now + i * 100 });
  }
  return batteryGuardian.evaluate(snapshot({ rpm: 900, voltage: 13.8 }), { ...context(), now: now + 1000 });
}

describe("cranking", () => {
  it("says nothing about a healthy battery", () => {
    expect(crankAfterResting(12.7)).toEqual([]);
  });

  it("mentions a slightly low resting voltage as coaching", () => {
    const cues = crankAfterResting(12.35);
    expect(cues.map((c) => c.id)).toContain("battery.warn");
    expect(cues.find((c) => c.id === "battery.warn")!.severity).toBe("coach");
  });

  it("escalates a deeply discharged battery to protective", () => {
    const cues = crankAfterResting(12.0);
    expect(cues.map((c) => c.id)).toContain("battery.deep");
    expect(cues.find((c) => c.id === "battery.deep")!.severity).toBe("protective");
  });

  it("gives only the more serious of the two verdicts", () => {
    const cues = crankAfterResting(12.0);
    expect(cues.map((c) => c.id)).not.toContain("battery.warn");
  });

  it("does not treat a running engine as a fresh crank on every sample", () => {
    const ctx = context();
    batteryGuardian.evaluate(snapshot({ rpm: 0, voltage: 12.0 }), ctx);
    const first = batteryGuardian.evaluate(snapshot({ rpm: 900, voltage: 13.8 }), { ...ctx, now: START + 1000 });
    expect(first.length).toBeGreaterThan(0);

    // Still running a second later: nothing new has happened.
    const second = batteryGuardian.evaluate(snapshot({ rpm: 900, voltage: 13.8 }), { ...ctx, now: START + 2000 });
    expect(second.map((c) => c.id)).not.toContain("battery.deep");
  });

  it("copes with an adapter that never reports voltage", () => {
    const ctx = context();
    batteryGuardian.evaluate(snapshot({ rpm: 0, voltage: undefined }), ctx);
    expect(() =>
      batteryGuardian.evaluate(snapshot({ rpm: 900, voltage: undefined }), { ...ctx, now: START + 1000 })
    ).not.toThrow();
  });
});

describe("charging", () => {
  /** Holds a voltage at running rpm for a stretch and returns the last cues. */
  function hold(volts: number, forMs: number, ctx = context()) {
    batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: volts }), ctx);
    return batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: volts }), { ...ctx, now: START + forMs });
  }

  it("says nothing at a normal charging voltage", () => {
    expect(hold(14.1, 120_000)).toEqual([]);
  });

  it("warns when charging voltage stays low with the engine running", () => {
    expect(hold(12.8, 90_000).map((c) => c.id)).toContain("battery.chargingLow");
  });

  it("does not warn on a brief dip", () => {
    // A momentary sag under a big electrical load is normal.
    expect(hold(12.8, 20_000)).toEqual([]);
  });

  it("says it once rather than on every sample", () => {
    const ctx = context();
    batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: 12.8 }), ctx);
    const first = batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: 12.8 }), { ...ctx, now: START + 90_000 });
    expect(first.map((c) => c.id)).toContain("battery.chargingLow");
    const again = batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: 12.8 }), { ...ctx, now: START + 120_000 });
    expect(again.map((c) => c.id)).not.toContain("battery.chargingLow");
  });

  it("ignores low voltage at idle, where the alternator may not be charging yet", () => {
    const ctx = context();
    batteryGuardian.evaluate(snapshot({ rpm: 700, voltage: 12.8 }), ctx);
    const cues = batteryGuardian.evaluate(snapshot({ rpm: 700, voltage: 12.8 }), { ...ctx, now: START + 90_000 });
    expect(cues).toEqual([]);
  });

  it("warns about overcharging", () => {
    expect(hold(15.6, 90_000).map((c) => c.id)).toContain("battery.overcharge");
  });

  it("allows a higher charging voltage in the cold, as the regulator intends", () => {
    // 15.2 V is overcharging at 25 °C but normal below freezing.
    const freezing = context({ ambientC: -10 });
    expect(hold(15.2, 90_000, freezing)).toEqual([]);
    expect(hold(15.2, 90_000, context({ ambientC: 30 })).map((c) => c.id)).toContain("battery.overcharge");
  });

  it("clears its streaks between trips", () => {
    const ctx = context();
    batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: 12.8 }), ctx);
    batteryGuardian.resetTrip();
    // The clock restarted, so a sample a minute later is not yet a streak.
    const cues = batteryGuardian.evaluate(snapshot({ rpm: 2000, voltage: 12.8 }), { ...ctx, now: START + 90_000 });
    expect(cues).toEqual([]);
  });
});
