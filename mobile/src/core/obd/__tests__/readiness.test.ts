import { parseReadiness, readinessVerdict } from "../readiness";

describe("parseReadiness", () => {
  it("returns undefined for a short frame", () => {
    expect(parseReadiness([0x00, 0x07])).toBeUndefined();
  });

  it("reads MIL state and DTC count from byte A", () => {
    // 0x83 = MIL on, 3 stored codes.
    const r = parseReadiness([0x83, 0x07, 0x00, 0x00])!;
    expect(r.milOn).toBe(true);
    expect(r.dtcCount).toBe(3);

    const clean = parseReadiness([0x00, 0x07, 0x00, 0x00])!;
    expect(clean.milOn).toBe(false);
    expect(clean.dtcCount).toBe(0);
  });

  it("treats the readiness bits as inverted — 1 means incomplete", () => {
    // B = 0x07: all three continuous monitors supported, none flagged incomplete.
    const complete = parseReadiness([0x00, 0x07, 0x00, 0x00])!;
    for (const key of ["misfire", "fuelSystem", "components"]) {
      const m = complete.monitors.find((x) => x.key === key)!;
      expect(m.supported).toBe(true);
      expect(m.complete).toBe(true);
    }
    expect(complete.isReady).toBe(true);

    // B = 0x77: same three supported, all three incomplete.
    const pending = parseReadiness([0x00, 0x77, 0x00, 0x00])!;
    expect(pending.monitors.filter((m) => m.supported && !m.complete)).toHaveLength(3);
    expect(pending.incompleteCount).toBe(3);
    expect(pending.isReady).toBe(false);
  });

  it("selects the spark monitor set when bit B3 is clear", () => {
    // C = 0x21: catalyst (bit0) and oxygenSensor (bit5) supported.
    const r = parseReadiness([0x00, 0x07, 0x21, 0x00])!;
    expect(r.ignition).toBe("spark");
    expect(r.monitors.find((m) => m.key === "catalyst")!.supported).toBe(true);
    expect(r.monitors.find((m) => m.key === "oxygenSensor")!.supported).toBe(true);
    expect(r.monitors.find((m) => m.key === "evapSystem")!.supported).toBe(false);
  });

  it("selects the diesel monitor set when bit B3 is set", () => {
    // B3 set -> compression ignition. C = 0x43: nmhcCatalyst, noxScr, pmFilter.
    const r = parseReadiness([0x00, 0x0f, 0x43, 0x00])!;
    expect(r.ignition).toBe("compression");
    expect(r.monitors.find((m) => m.key === "nmhcCatalyst")!.supported).toBe(true);
    expect(r.monitors.find((m) => m.key === "noxScr")!.supported).toBe(true);
    expect(r.monitors.find((m) => m.key === "pmFilter")!.supported).toBe(true);
    // Spark-only monitors must not appear for a diesel.
    expect(r.monitors.find((m) => m.key === "catalyst")).toBeUndefined();
    // Reserved bit positions are not surfaced as monitors.
    expect(r.monitors.find((m) => m.key === "reserved")).toBeUndefined();
  });

  it("ignores incomplete flags on unsupported monitors", () => {
    // Nothing supported (C=0), but D claims everything incomplete.
    const r = parseReadiness([0x00, 0x00, 0x00, 0xff])!;
    expect(r.incompleteCount).toBe(0);
    expect(r.isReady).toBe(true);
  });
});

describe("readinessVerdict", () => {
  const base = { milOn: false, dtcCount: 0, ignition: "spark" as const, monitors: [], isReady: true };

  it("is ready only with nothing outstanding", () => {
    expect(readinessVerdict({ ...base, incompleteCount: 0 })).toBe("ready");
  });

  it("allows the usual small tolerance before calling it a fail", () => {
    expect(readinessVerdict({ ...base, incompleteCount: 1, isReady: false })).toBe("almost");
    expect(readinessVerdict({ ...base, incompleteCount: 2, isReady: false })).toBe("almost");
    expect(readinessVerdict({ ...base, incompleteCount: 3, isReady: false })).toBe("notReady");
  });

  it("is never ready with the MIL lit, whatever the monitors say", () => {
    expect(readinessVerdict({ ...base, incompleteCount: 0, milOn: true })).toBe("notReady");
  });
});
