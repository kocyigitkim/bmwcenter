import { overheatWatchdog } from "../overheatWatchdog";
import { thermostatWatch } from "../thermostatWatch";
import { emptyCareContext } from "../careTypes";
import { resolveVehicleProfile } from "../../vehicle/profileResolver";
import { coolantAlarmC } from "../../vehicle/vehicleProfile";
import type { CareContext } from "../careTypes";
import type { VehicleSnapshot } from "../../obd/vehicleSnapshot";

jest.mock("../../storage/db", () => ({
  db: { insert: () => ({ values: () => Promise.resolve() }) },
}));
jest.mock("../baselineLearner", () => ({
  baselineLearner: {
    observe: () => Promise.resolve(),
    snapshot: () => undefined,
  },
}));

/** 82 °C thermostat, 1.4 bar cap. */
const dieselProfile = resolveVehicleProfile({ fuel: "diesel", isTurbo: true });
/** 95 °C map-controlled thermostat, 2.0 bar cap. */
const euroTurboProfile = resolveVehicleProfile({
  fuel: "gasoline",
  isTurbo: true,
  obdHints: { boostOverBaroKpa: 50 },
});

function contextFor(profile: typeof dieselProfile, now: number): CareContext {
  return { ...emptyCareContext(now), vehicle: profile, ambientC: 20 };
}

function snapshot(over: Partial<VehicleSnapshot>): VehicleSnapshot {
  return { timestamp: Date.now(), rpm: 1500, speedKmh: 60, engineLoadPct: 40, ...over };
}

/** Warms from cold at a realistic ~2 °C/min, then holds, so the startup grace expires
 * and neither the plausibility guard nor the rapid-rise rule fires on the ramp itself. */
function runCoolant(profile: typeof dieselProfile, coolantC: number, startAt: number): string[] {
  overheatWatchdog.resetTrip();
  const cues: string[] = [];
  let t = startAt;
  for (let c = 60; c <= coolantC; c += 1) {
    t += 30_000;
    cues.push(...overheatWatchdog.evaluate(snapshot({ coolantC: c }), contextFor(profile, t)).map((q) => q.id));
  }
  for (let i = 0; i < 4; i++) {
    t += 30_000;
    cues.push(...overheatWatchdog.evaluate(snapshot({ coolantC }), contextFor(profile, t)).map((q) => q.id));
  }
  return cues;
}

describe("overheatWatchdog thresholds follow the vehicle profile", () => {
  it("alarms the cool-running diesel at a temperature the hot-running turbo tolerates", () => {
    // 108 °C sits above the 82 °C-thermostat diesel's alarm point but below the
    // 95 °C map-controlled turbo's — the whole point of per-vehicle thresholds.
    expect(coolantAlarmC(dieselProfile)).toBeLessThan(108);
    expect(coolantAlarmC(euroTurboProfile)).toBeGreaterThan(108);

    const dieselCues = runCoolant(dieselProfile, 108, 1_000_000);
    const turboCues = runCoolant(euroTurboProfile, 108, 5_000_000);

    expect(dieselCues).toContain("overheat.alarm");
    expect(turboCues).not.toContain("overheat.alarm");
    expect(turboCues).not.toContain("overheat.critical");
  });

  it("stays quiet for both vehicles at their own normal operating temperature", () => {
    expect(runCoolant(dieselProfile, 92, 10_000_000)).not.toContain("overheat.alarm");
    expect(runCoolant(euroTurboProfile, 105, 20_000_000)).not.toContain("overheat.alarm");
  });

  it("does not report a plain monotonic warmup as an oscillating thermostat", () => {
    // A steady climb is not oscillation however far it travels.
    expect(runCoolant(dieselProfile, 92, 30_000_000)).not.toContain("overheat.unstable");
    expect(runCoolant(euroTurboProfile, 105, 40_000_000)).not.toContain("overheat.unstable");
  });

  it("still reports a genuinely hunting thermostat", () => {
    overheatWatchdog.resetTrip();
    const cues: string[] = [];
    let t = 60_000_000;
    for (let c = 60; c <= 95; c += 1) {
      t += 30_000;
      cues.push(...overheatWatchdog.evaluate(snapshot({ coolantC: c }), contextFor(dieselProfile, t)).map((q) => q.id));
    }
    // Hunting swings far faster than warmup does — several cycles inside the 10-minute
    // oscillation window is exactly what a failing thermostat looks like.
    for (let cycle = 0; cycle < 3; cycle++) {
      for (const c of [...range(95, 80, -1), ...range(80, 95, 1)]) {
        t += 5000;
        cues.push(...overheatWatchdog.evaluate(snapshot({ coolantC: c }), contextFor(dieselProfile, t)).map((q) => q.id));
      }
    }
    expect(cues).toContain("overheat.unstable");
  });
});

function range(from: number, to: number, step: number): number[] {
  const out: number[] = [];
  for (let v = from; step > 0 ? v <= to : v >= to; v += step) out.push(v);
  return out;
}

describe("thermostatWatch slow-warmup rule", () => {
  const start = 50_000_000;

  function drive(profile: typeof dieselProfile, coolantC: number, minutes: number): string[] {
    thermostatWatch.resetTrip();
    const cues: string[] = [];
    let t = start;
    for (let i = 0; i < minutes * 30; i++) {
      t += 2000;
      cues.push(
        ...thermostatWatch
          .evaluate(snapshot({ coolantC, speedKmh: 90 }), contextFor(profile, t))
          .map((q) => q.id)
      );
    }
    return cues;
  }

  it("flags an engine still cold after real distance covered", () => {
    // 60 °C is well below the diesel's 79 °C warmup target, after ~15 min at 90 km/h.
    expect(drive(dieselProfile, 60, 15)).toContain("thermostat.slowWarmup");
  });

  it("does not flag a car that is simply below a high map-controlled target but warm", () => {
    // 85 °C is cold for the 95 °C euro turbo but comfortably warm for the diesel.
    expect(drive(dieselProfile, 85, 15)).not.toContain("thermostat.slowWarmup");
    expect(drive(euroTurboProfile, 85, 15)).not.toContain("thermostat.slowWarmup");
  });

  it("does not flag a short trip that has not covered enough distance yet", () => {
    expect(drive(dieselProfile, 60, 3)).not.toContain("thermostat.slowWarmup");
  });

  it("announces at most once per trip", () => {
    const cues = drive(dieselProfile, 60, 25).filter((id) => id === "thermostat.slowWarmup");
    expect(cues).toHaveLength(1);
  });
});
