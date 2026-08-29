import { coldEngineShield } from "../coldEngineShield";
import { emptyCareContext } from "../careTypes";
import type { CareContext } from "../careTypes";
import type { VehicleSnapshot } from "../../obd/vehicleSnapshot";

jest.mock("../../storage/db", () => ({
  db: { insert: () => ({ values: () => ({ catch: () => undefined }) }) },
}));

const START = 1_700_000_000_000;

function context(over: Partial<CareContext> = {}): CareContext {
  return { ...emptyCareContext(START), ambientC: 20, ...over };
}

function snapshot(over: Partial<VehicleSnapshot> = {}): VehicleSnapshot {
  return { timestamp: START, runtimeS: 600, speedKmh: 60, rpm: 1500, engineLoadPct: 30, coolantC: 60, ...over };
}

/** Violations only count after a 1.5 s streak, so a single sample never fires. */
function sustain(snap: VehicleSnapshot, ctx: CareContext, ms = 2000) {
  coldEngineShield.evaluate(snap, ctx);
  return coldEngineShield.evaluate(snap, { ...ctx, now: ctx.now + ms });
}

beforeEach(() => coldEngineShield.resetTrip());

describe("cold-engine violations", () => {
  it("warns when the engine is revved while cold", () => {
    // Oil around 30 °C caps rpm at ~2730; 4500 is well past it.
    const cues = sustain(snapshot({ rpm: 4500 }), context({ oilTempC: 30 }));
    expect(cues.length).toBeGreaterThan(0);
    expect(cues[0]!.id).toMatch(/^cold\.v/);
  });

  it("stays quiet at the same rpm once the engine is warm", () => {
    // Above 80 °C there is no cap at all — this is just normal driving.
    expect(sustain(snapshot({ rpm: 4500 }), context({ oilTempC: 95 }))).toEqual([]);
  });

  it("does not fire on a brief blip that never sustains", () => {
    const ctx = context({ oilTempC: 30 });
    coldEngineShield.evaluate(snapshot({ rpm: 4500 }), ctx);
    // Back below the cap 300 ms later: the streak resets, nothing is reported.
    expect(coldEngineShield.evaluate(snapshot({ rpm: 1200 }), { ...ctx, now: START + 300 })).toEqual([]);
  });

  it("escalates from coaching to a protective warning on a second violation", () => {
    const ctx = context({ oilTempC: 30 });
    const first = sustain(snapshot({ rpm: 3000 }), ctx);
    expect(first[0]!.severity).toBe("coach");

    // After a hit the streak start is pushed 10 s into the future, so a sample
    // well past that counts as the next violation on its own.
    const second = coldEngineShield.evaluate(snapshot({ rpm: 3000 }), { ...ctx, now: START + 30_000 });
    expect(second[0]!.severity).toBe("protective");
  });

  it("goes straight to protective when the engine is revved far past the cap", () => {
    // More than 25 % over is not a slip of the foot.
    const cues = sustain(snapshot({ rpm: 6000 }), context({ oilTempC: 15 }));
    expect(cues[0]!.severity).toBe("protective");
  });

  it("stops repeating itself after the second warning", () => {
    const ctx = context({ oilTempC: 30 });
    let now = START;
    for (let i = 0; i < 5; i += 1) {
      coldEngineShield.evaluate(snapshot({ rpm: 4500 }), { ...ctx, now });
      coldEngineShield.evaluate(snapshot({ rpm: 4500 }), { ...ctx, now: now + 2000 });
      now += 30_000;
    }
    expect(coldEngineShield.coldViolationsThisTrip).toBeGreaterThan(2);
    // Counting continues, but the driver is not nagged past the second cue.
    const extra = sustain(snapshot({ rpm: 4500 }), { ...ctx, now });
    expect(extra).toEqual([]);
  });

  it("says nothing during catalyst warm-up, when high idle is the ECU's doing", () => {
    const cues = sustain(
      snapshot({ runtimeS: 40, coolantC: 20, speedKmh: 0, rpm: 1600, engineLoadPct: 60 }),
      context({ oilTempC: 15 })
    );
    expect(cues.filter((c) => c.id.startsWith("cold.v"))).toEqual([]);
  });

  it("treats boost on a cold engine as a violation regardless of rpm", () => {
    const cues = sustain(
      snapshot({ rpm: 1800, engineLoadPct: 20, boostActualKpa: 160, baroKpa: 100 }),
      context({ oilTempC: 40 })
    );
    expect(cues.some((c) => c.id.startsWith("cold.v"))).toBe(true);
  });

  it("forgets its count between trips", () => {
    sustain(snapshot({ rpm: 4500 }), context({ oilTempC: 30 }));
    expect(coldEngineShield.coldViolationsThisTrip).toBeGreaterThan(0);
    coldEngineShield.resetTrip();
    expect(coldEngineShield.coldViolationsThisTrip).toBe(0);
  });
});

describe("idling", () => {
  it("says the engine is ready once it has idled long enough", () => {
    const ctx = context({ oilTempC: 30 });
    const idling = snapshot({ speedKmh: 0, rpm: 800, engineLoadPct: 10, runtimeS: 45 });
    coldEngineShield.evaluate(idling, ctx);
    const cues = coldEngineShield.evaluate(idling, { ...ctx, now: START + 45_000 });
    expect(cues.map((c) => c.id)).toContain("cold.ready");
  });

  it("says it only once", () => {
    const ctx = context({ oilTempC: 30 });
    const idling = snapshot({ speedKmh: 0, rpm: 800, engineLoadPct: 10 });
    coldEngineShield.evaluate(idling, ctx);
    coldEngineShield.evaluate(idling, { ...ctx, now: START + 45_000 });
    const again = coldEngineShield.evaluate(idling, { ...ctx, now: START + 60_000 });
    expect(again.map((c) => c.id)).not.toContain("cold.ready");
  });

  it("waits longer before calling idling wasteful in the cold", () => {
    const idling = snapshot({ speedKmh: 0, rpm: 800, engineLoadPct: 10 });
    const freezing = context({ oilTempC: 30, ambientC: -5 });
    coldEngineShield.evaluate(idling, freezing);
    // Three minutes is already too long at 20 °C but not below zero.
    const atThreeMinutes = coldEngineShield.evaluate(idling, { ...freezing, now: START + 190_000 });
    expect(atThreeMinutes.map((c) => c.id)).not.toContain("cold.longIdle");

    const atSevenMinutes = coldEngineShield.evaluate(idling, { ...freezing, now: START + 420_000 });
    expect(atSevenMinutes.map((c) => c.id)).toContain("cold.longIdle");
  });

  it("forgets the idle timer as soon as the car moves", () => {
    const ctx = context({ oilTempC: 30 });
    coldEngineShield.evaluate(snapshot({ speedKmh: 0, rpm: 800, engineLoadPct: 10 }), ctx);
    coldEngineShield.evaluate(snapshot({ speedKmh: 40 }), { ...ctx, now: START + 10_000 });
    const cues = coldEngineShield.evaluate(snapshot({ speedKmh: 0, rpm: 800, engineLoadPct: 10 }), {
      ...ctx,
      now: START + 20_000,
    });
    // The clock restarted, so nothing is due yet.
    expect(cues).toEqual([]);
  });
});

describe("cold phase flag", () => {
  it("reports the cold phase to the rest of the care system", () => {
    const cold = context({ oilTempC: 40 });
    coldEngineShield.evaluate(snapshot(), cold);
    expect(cold.isColdPhase).toBe(true);

    const warm = context({ oilTempC: 95 });
    coldEngineShield.evaluate(snapshot(), warm);
    expect(warm.isColdPhase).toBe(false);
  });
});
