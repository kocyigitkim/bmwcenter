import { categoryForCode, computeHealth, type HealthInput } from "../healthScore";

const NOW = 1_700_000_000_000;

function input(over: Partial<HealthInput> = {}): HealthInput {
  return { now: NOW, dtcs: [], protectionEvents: [], cranks: [], hasScanned: false, ...over };
}

describe("categoryForCode", () => {
  it("routes powertrain ranges to their subsystem", () => {
    expect(categoryForCode("P0171")).toBe("fuelSystem"); // system too lean
    expect(categoryForCode("P0301")).toBe("engine"); // cylinder 1 misfire
    expect(categoryForCode("P0420")).toBe("emissions"); // catalyst efficiency
    expect(categoryForCode("P0700")).toBe("transmission");
  });

  it("routes cooling codes that their numeric range would misfile", () => {
    // P0128 sits in the fuel/air range but is a thermostat fault.
    expect(categoryForCode("P0128")).toBe("cooling");
    expect(categoryForCode("P0217")).toBe("cooling");
    expect(categoryForCode("P0480")).toBe("cooling");
  });

  it("keeps network and body codes out of the powertrain score", () => {
    expect(categoryForCode("U0100")).toBe("battery");
    expect(categoryForCode("B1234")).toBe("battery");
  });
});

describe("computeHealth", () => {
  it("reports unknown rather than perfect health with no data at all", () => {
    const report = computeHealth(input());
    expect(report.overallGrade).toBe("unknown");
    expect(report.overallScore).toBeUndefined();
    expect(report.unknownCount).toBe(report.categories.length);
    expect(report.categories.every((c) => c.score === undefined)).toBe(true);
  });

  it("scores a clean scan as good", () => {
    const report = computeHealth(input({ hasScanned: true }));
    expect(report.overallScore).toBe(100);
    expect(report.overallGrade).toBe("good");
    expect(report.unknownCount).toBe(0);
  });

  it("weighs a permanent code harder than a pending one", () => {
    const permanent = computeHealth(input({ hasScanned: true, dtcs: [{ code: "P0420", status: "permanent" }] }));
    const pending = computeHealth(input({ hasScanned: true, dtcs: [{ code: "P0420", status: "pending" }] }));
    const emissionsOf = (r: typeof permanent) => r.categories.find((c) => c.category === "emissions")!.score!;
    expect(emissionsOf(permanent)).toBeLessThan(emissionsOf(pending));
  });

  it("attributes a code only to its own system", () => {
    const report = computeHealth(input({ hasScanned: true, dtcs: [{ code: "P0301", status: "stored" }] }));
    expect(report.categories.find((c) => c.category === "engine")!.grade).not.toBe("good");
    expect(report.categories.find((c) => c.category === "cooling")!.score).toBe(100);
  });

  it("ignores protection events older than the window", () => {
    const old = NOW - 200 * 24 * 3600_000;
    const report = computeHealth(
      input({ hasScanned: true, protectionEvents: [{ type: "overheat", severity: "alarm", t: old }] })
    );
    expect(report.categories.find((c) => c.category === "cooling")!.score).toBe(100);
  });

  it("counts repeat protection events more heavily but caps the deduction", () => {
    const events = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ type: "overheat", severity: "alarm", t: NOW - i * 1000 }));
    const coolingOf = (n: number) =>
      computeHealth(input({ hasScanned: true, protectionEvents: events(n) })).categories.find(
        (c) => c.category === "cooling"
      )!.score!;
    expect(coolingOf(3)).toBeLessThan(coolingOf(1));
    // Capped: twenty events are not worse than ten.
    expect(coolingOf(20)).toBe(coolingOf(10));
    expect(coolingOf(20)).toBeGreaterThan(0);
  });

  it("grades the battery from the worst recent cranking voltage", () => {
    const weak = computeHealth(input({ cranks: [{ date: NOW, minVoltage: 9.3 }] }));
    const bad = computeHealth(input({ cranks: [{ date: NOW, minVoltage: 8.6 }] }));
    const batteryOf = (r: typeof weak) => r.categories.find((c) => c.category === "battery")!.score!;
    expect(batteryOf(bad)).toBeLessThan(batteryOf(weak));
    expect(batteryOf(weak)).toBeLessThan(100);

    const healthy = computeHealth(input({ cranks: [{ date: NOW, minVoltage: 10.8 }] }));
    expect(batteryOf(healthy)).toBe(100);
  });

  it("raises battery confidence once several cranks are recorded", () => {
    const cranks = Array.from({ length: 6 }, (_, i) => ({ date: NOW - i * 86400_000, minVoltage: 10.5 }));
    const report = computeHealth(input({ cranks }));
    expect(report.categories.find((c) => c.category === "battery")!.confidence).toBe("high");
  });

  it("keeps emissions confidence low until a scan has run", () => {
    expect(
      computeHealth(input()).categories.find((c) => c.category === "emissions")!.confidence
    ).toBe("low");
    expect(
      computeHealth(input({ hasScanned: true, readiness: { incompleteCount: 0, supportedCount: 8, milOn: false } }))
        .categories.find((c) => c.category === "emissions")!.confidence
    ).toBe("high");
  });

  it("deducts for incomplete monitors and a lit MIL", () => {
    const report = computeHealth(
      input({ hasScanned: true, readiness: { incompleteCount: 3, supportedCount: 8, milOn: true } })
    );
    const emissions = report.categories.find((c) => c.category === "emissions")!;
    expect(emissions.score).toBeLessThan(60);
    expect(emissions.evidence.map((e) => e.key)).toEqual(
      expect.arrayContaining(["health.evidence.milOn", "health.evidence.monitorsIncomplete"])
    );
  });

  it("never returns a negative score", () => {
    const dtcs = Array.from({ length: 10 }, (_, i) => ({
      code: `P030${i}`,
      status: "permanent" as const,
    }));
    const report = computeHealth(input({ hasScanned: true, dtcs }));
    expect(report.categories.find((c) => c.category === "engine")!.score).toBe(0);
  });

  it("averages only the categories it could judge", () => {
    // Battery evidence alone: other categories stay unknown, overall reflects battery.
    const report = computeHealth(input({ cranks: [{ date: NOW, minVoltage: 8.5 }] }));
    expect(report.unknownCount).toBeGreaterThan(0);
    expect(report.overallScore).toBe(report.categories.find((c) => c.category === "battery")!.score);
  });
});
