import { alertSeverityFrom, planFor } from "../severityRouter";
import { estimateOilTempC } from "../oilTempEstimator";
import {
  bucketAmbient,
  bucketLoad,
  bucketSpeed,
  compositeBucket,
  severityRank,
  type CueSeverity,
} from "../careTypes";

const ALL_SEVERITIES: CueSeverity[] = ["critical", "protective", "coach", "celebration"];

describe("planFor", () => {
  it("takes over the screen only for something critical", () => {
    expect(planFor("critical").fullScreen).toBe(true);
    for (const severity of ALL_SEVERITIES.filter((s) => s !== "critical")) {
      expect(planFor(severity).fullScreen).toBe(false);
    }
  });

  it("notifies a protective warning only when the app is not in front of the user", () => {
    // In the foreground the chip already says it; a notification would be noise.
    expect(planFor("protective", false).notification).toBe(false);
    expect(planFor("protective", true).notification).toBe(true);
  });

  it("never turns coaching into a notification, foreground or background", () => {
    expect(planFor("coach", true).notification).toBe(false);
    expect(planFor("celebration", true).notification).toBe(false);
  });

  it("sounds a critical alert twice and coaching not at all", () => {
    expect(planFor("critical").toneCount).toBe(2);
    expect(planFor("protective").toneCount).toBe(1);
    expect(planFor("coach").toneCount).toBe(0);
  });

  it("returns a usable plan for every severity", () => {
    for (const severity of ALL_SEVERITIES) {
      const plan = planFor(severity);
      expect(plan).toBeDefined();
      expect(typeof plan.speak).toBe("boolean");
      expect(plan.toneCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("alertSeverityFrom", () => {
  it("maps every cue severity onto an alert severity", () => {
    expect(alertSeverityFrom("critical")).toBe("critical");
    expect(alertSeverityFrom("protective")).toBe("warning");
    expect(alertSeverityFrom("coach")).toBe("info");
    expect(alertSeverityFrom("celebration")).toBe("info");
  });

  it("never promotes praise into a warning", () => {
    expect(alertSeverityFrom("celebration")).not.toBe("critical");
    expect(alertSeverityFrom("celebration")).not.toBe("warning");
  });
});

describe("severityRank", () => {
  it("orders severities so the worst wins when two cues compete", () => {
    const ordered = [...ALL_SEVERITIES].sort((a, b) => severityRank(b) - severityRank(a));
    expect(ordered[0]).toBe("critical");
    expect(severityRank("critical")).toBeGreaterThan(severityRank("protective"));
    expect(severityRank("protective")).toBeGreaterThan(severityRank("coach"));
  });
});

describe("estimateOilTempC", () => {
  it("uses the real reading whenever the car reports one", () => {
    // Even a strange measured value beats a guess.
    expect(estimateOilTempC(97, 90, 20, 1200)).toBe(97);
    expect(estimateOilTempC(-5, 90, 20, 1200)).toBe(-5);
  });

  it("starts at ambient and never reaches coolant temperature", () => {
    expect(estimateOilTempC(undefined, 90, 20, 0)).toBeCloseTo(20, 5);
    // Oil lags coolant; claiming they are equal would let the cold-engine
    // warnings clear too early.
    expect(estimateOilTempC(undefined, 90, 20, 100_000)).toBeCloseTo(20 + 70 * 0.9, 5);
  });

  it("warms monotonically with runtime", () => {
    const at = (s: number) => estimateOilTempC(undefined, 90, 20, s);
    const points = [0, 120, 300, 600, 750, 900, 1800].map(at);
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!).toBeGreaterThanOrEqual(points[i - 1]!);
    }
  });

  it("does not go below ambient on a negative runtime", () => {
    expect(estimateOilTempC(undefined, 90, 20, -50)).toBeCloseTo(20, 5);
  });

  it("falls back to ambient when coolant is unknown", () => {
    expect(estimateOilTempC(undefined, undefined, 15, 1200)).toBeCloseTo(15, 5);
  });

  it("cools towards ambient on a winter start rather than inventing heat", () => {
    const cold = estimateOilTempC(undefined, -5, -10, 60);
    expect(cold).toBeGreaterThanOrEqual(-10);
    expect(cold).toBeLessThanOrEqual(-5);
  });
});

describe("baseline buckets", () => {
  it("separates the conditions that genuinely change a reading", () => {
    expect(bucketAmbient(-3)).not.toBe(bucketAmbient(5));
    expect(bucketLoad(20)).not.toBe(bucketLoad(80));
    expect(bucketSpeed(0)).not.toBe(bucketSpeed(100));
  });

  it("keeps unknown apart from any real value", () => {
    // A baseline learned from "no reading" must never be compared against one
    // learned at a real temperature.
    expect(bucketAmbient(undefined)).toBe("ambient:unknown");
    expect(bucketLoad(undefined)).toBe("load:unknown");
    expect(bucketSpeed(undefined)).toBe("speed:unknown");
    expect(bucketAmbient(undefined)).not.toBe(bucketAmbient(0));
  });

  it("puts a stationary car in its own speed bucket", () => {
    // Idling and crawling burn very differently.
    expect(bucketSpeed(0)).toBe("speed:0");
    expect(bucketSpeed(0.4)).toBe("speed:0");
    expect(bucketSpeed(0.6)).not.toBe("speed:0");
  });

  it("uses half-open ranges so a boundary lands in exactly one bucket", () => {
    expect(bucketAmbient(10)).toBe("ambient:10-20");
    expect(bucketAmbient(9.99)).toBe("ambient:0-10");
    expect(bucketLoad(70)).toBe("load:>70");
    expect(bucketLoad(69.9)).toBe("load:40-70");
  });

  it("composes the three into one stable key", () => {
    expect(compositeBucket(15, 50, 60)).toBe("ambient:10-20|load:40-70|speed:50-90");
    expect(compositeBucket(15, 50, 60)).toBe(compositeBucket(15, 50, 60));
    expect(compositeBucket(15, 50, 60)).not.toBe(compositeBucket(15, 50, 100));
  });
});
