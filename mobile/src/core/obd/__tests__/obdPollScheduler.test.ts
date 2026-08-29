jest.mock("react-native-ble-plx", () => ({
  BleManager: class {},
  State: {},
}));

import { duePIDs, resetPollScheduler } from "../obdService";

describe("OBD poll scheduler (tiered: fast metrics every cycle, slow ones rarely)", () => {
  beforeEach(() => resetPollScheduler());

  test("first cycle (forceAll) requests every tier at once", () => {
    const due = duePIDs(0, true, new Set());
    // fast: rpm, speed, fuelRate, maf, map, intakeAir
    expect(due).toEqual(expect.arrayContaining([0x0c, 0x0d, 0x5e]));
    // medium: coolant
    expect(due).toContain(0x05);
    // slow: baro
    expect(due).toContain(0x33);
    // rare: stft1
    expect(due).toContain(0x06);
  });

  test("speed and RPM are due on every single cycle, never starved by slower tiers", () => {
    duePIDs(0, true, new Set());
    for (let t = 200; t <= 5000; t += 200) {
      const due = duePIDs(t, false, new Set());
      expect(due).toContain(0x0c);
      expect(due).toContain(0x0d);
    }
  });

  test("medium/slow/rare tiers are NOT re-queried before their own interval elapses", () => {
    duePIDs(0, true, new Set()); // primes all tiers at t=0
    const due = duePIDs(199, false, new Set()); // still inside the fast interval too
    expect(due).not.toContain(0x05); // medium (1000ms) not due yet
    expect(due).not.toContain(0x33); // slow (5000ms) not due yet
    expect(due).not.toContain(0x06); // rare (30000ms) not due yet
  });

  test("medium tier becomes due again once its interval elapses", () => {
    duePIDs(0, true, new Set());
    const due = duePIDs(1000, false, new Set());
    expect(due).toContain(0x05);
  });

  test("respects the supported-PID filter", () => {
    const due = duePIDs(0, true, new Set([0x0c, 0x0d]));
    expect(due).toEqual(expect.arrayContaining([0x0c, 0x0d]));
    expect(due).not.toContain(0x05);
    expect(due).not.toContain(0x33);
  });
});
