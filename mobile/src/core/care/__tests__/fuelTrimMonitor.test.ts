import { emptyCareContext } from "../careTypes";
import type { CareContext } from "../careTypes";
import type { VehicleSnapshot } from "../../obd/vehicleSnapshot";
import type { Trip } from "../../storage/models";

jest.mock("../../storage/db", () => ({
  db: { insert: () => ({ values: () => ({ catch: () => undefined }) }) },
}));
jest.mock("../baselineLearner", () => ({
  baselineLearner: { observe: () => Promise.resolve(), snapshot: () => undefined },
}));

const START = 1_700_000_000_000;

function context(): CareContext {
  return emptyCareContext(START);
}

/** Warm engine, plenty of fuel — the conditions under which trim is meaningful. */
function snapshot(over: Partial<VehicleSnapshot> = {}): VehicleSnapshot {
  return {
    timestamp: START,
    coolantC: 92,
    fuelLevelPct: 70,
    ltftBank1: 0,
    stftBank1: 0,
    engineLoadPct: 40,
    speedKmh: 60,
    rpm: 2000,
    ...over,
  };
}

/**
 * A fresh module per test.
 *
 * The monitor is a singleton whose cross-trip counters deliberately survive
 * `resetTrip` — that is how it recognises a pattern spanning several drives —
 * so sharing one instance would let each test see the previous one's history.
 */
type Monitor = typeof import("../fuelTrimMonitor").fuelTrimMonitor;
let fuelTrimMonitor: Monitor;

beforeEach(() => {
  jest.isolateModules(() => {
    fuelTrimMonitor = require("../fuelTrimMonitor").fuelTrimMonitor as Monitor;
  });
});

let tripCounter = 0;
function trip(over: Partial<Trip> = {}): Trip {
  tripCounter += 1;
  return { id: `trip-${tripCounter}`, durationS: 900 } as Trip;
}

/** Feeds enough samples in one band that the trip-end average is that value. */
function drive(ltft: number, over: Partial<VehicleSnapshot> = {}, samples = 10) {
  const ctx = context();
  for (let i = 0; i < samples; i += 1) {
    fuelTrimMonitor.evaluate(snapshot({ ltftBank1: ltft, ...over }), { ...ctx, now: START + i * 1000 });
  }
}

describe("when trim readings are ignored", () => {
  it("ignores a car that does not report long-term trim at all", () => {
    const cues = fuelTrimMonitor.evaluate(snapshot({ ltftBank1: undefined }), context());
    expect(cues).toEqual([]);
  });

  it("ignores a cold engine, where trim is not representative", () => {
    drive(30, { coolantC: 60 });
    expect(fuelTrimMonitor.onTripEnded(trip(), context())).toEqual([]);
  });

  it("ignores a nearly empty tank, where trim chases the last few litres", () => {
    drive(30, { fuelLevelPct: 10 });
    expect(fuelTrimMonitor.onTripEnded(trip(), context())).toEqual([]);
  });

  it("ignores deceleration fuel cut-off", () => {
    // Coasting in gear: no load at speed, so the mixture is not being trimmed.
    drive(30, { engineLoadPct: 2, rpm: 2500 });
    expect(fuelTrimMonitor.onTripEnded(trip(), context())).toEqual([]);
  });

  it("ignores a trip too short to mean anything", () => {
    drive(30, { speedKmh: 0, engineLoadPct: 10 });
    expect(fuelTrimMonitor.onTripEnded(trip({ durationS: 30 }), context())).toEqual([]);
  });
});

describe("drift patterns", () => {
  /** One drift pattern needs three trips and twenty minutes before it speaks. */
  function driveThreeTrips(ltft: number, over: Partial<VehicleSnapshot> = {}) {
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      fuelTrimMonitor.resetTrip();
      drive(ltft, over);
      results.push(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context()));
    }
    return results;
  }

  it("says nothing about normal trim", () => {
    expect(driveThreeTrips(5).flat()).toEqual([]);
  });

  it("says nothing after a single bad trip", () => {
    // One odd tankful is not a fault; three trips over twenty minutes is.
    drive(30, { speedKmh: 0, engineLoadPct: 10 });
    expect(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context())).toEqual([]);
  });

  it("reports a lean drift that persists across trips", () => {
    const results = driveThreeTrips(30, { speedKmh: 0, engineLoadPct: 10 });
    expect(results[0]).toEqual([]);
    expect(results[1]).toEqual([]);
    expect(results[2]!.map((c) => c.id)).toEqual(["trim.drift"]);
  });

  it("reports a rich drift too, not just lean", () => {
    // rich_all is named for what it needs: the drift must show at idle and at
    // part load. Rich in one band alone is not the pattern.
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      fuelTrimMonitor.resetTrip();
      drive(-30, { speedKmh: 0, engineLoadPct: 10 });
      drive(-30, { engineLoadPct: 40 });
      results.push(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context()));
    }
    expect(results[2]!.map((c) => c.id)).toEqual(["trim.drift"]);
  });

  it("does not report a rich mixture seen at part load alone", () => {
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      fuelTrimMonitor.resetTrip();
      drive(-30, { engineLoadPct: 40 });
      results.push(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context()));
    }
    expect(results.flat()).toEqual([]);
  });

  it("stops repeating once it has spoken, until the pattern builds up again", () => {
    const run = () => {
      fuelTrimMonitor.resetTrip();
      drive(30, { speedKmh: 0, engineLoadPct: 10 });
      return fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context());
    };
    run();
    run();
    expect(run().map((c) => c.id)).toEqual(["trim.drift"]);
    // The very next trip with the same drift must not say it again.
    expect(run()).toEqual([]);
  });

  it("reports it as coaching rather than an alarm", () => {
    // Trim drift is something to look into, not to pull over for.
    const results = driveThreeTrips(30, { speedKmh: 0, engineLoadPct: 10 });
    expect(results[2]![0]!.severity).toBe("coach");
  });

  it("forgets the running averages between trips", () => {
    drive(30, { speedKmh: 0, engineLoadPct: 10 });
    fuelTrimMonitor.resetTrip();
    // With the accumulator cleared there is nothing to judge the next trip on.
    expect(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context())).toEqual([]);
  });
});

describe("short-term trim", () => {
  it("counts short-term trim alongside long-term", () => {
    // 12 % long plus 12 % short is a 24 % total: over the threshold, though
    // neither figure is on its own.
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      fuelTrimMonitor.resetTrip();
      const ctx = context();
      for (let s = 0; s < 10; s += 1) {
        fuelTrimMonitor.evaluate(
          snapshot({ ltftBank1: 12, stftBank1: 12, speedKmh: 0, engineLoadPct: 10 }),
          { ...ctx, now: START + s * 1000 }
        );
      }
      results.push(fuelTrimMonitor.onTripEnded(trip({ durationS: 900 }), context()));
    }
    expect(results[2]!.map((c) => c.id)).toEqual(["trim.drift"]);
  });
});
