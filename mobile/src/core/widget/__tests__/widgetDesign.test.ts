import {
  MAX_HERO_SCALE,
  MAX_STATS,
  MIN_HERO_SCALE,
  PALETTES,
  clampScale,
  metricsUsedBy,
  normaliseDesign,
  resolveDesign,
  type WidgetDesign,
} from "../widgetDesign";
import { LIVE_ONLY, NO_VALUE, emptyDataSet, resolveMetric, type WidgetDataSet } from "../widgetMetrics";
import { WIDGET_PRESETS, defaultDesign, presetById } from "../widgetPresets";

const NOW = 1_700_000_000_000;

function data(over: Partial<WidgetDataSet> = {}): WidgetDataSet {
  return {
    ...emptyDataSet("BMW 320i"),
    text: { fuelLevel: "62%", range: "480 km", odometer: "152340 km" },
    fraction: { fuelLevel: 0.62 },
    ...over,
  };
}

describe("normaliseDesign", () => {
  it("keeps a well-formed design as it is", () => {
    const design = normaliseDesign({
      id: "x",
      palette: "paper",
      hero: "range",
      header: "vehicleName",
      secondary: "fuelLevel",
      bar: "fuelLevel",
      stats: ["odometer"],
      heroScale: 1.2,
      accentStripe: true,
    });
    expect(design.hero).toBe("range");
    expect(design.bar).toBe("fuelLevel");
    expect(design.heroScale).toBe(1.2);
  });

  it("replaces a metric it does not recognise rather than leaving a blank slot", () => {
    // A design saved by a newer build could name a metric this one lacks.
    const design = normaliseDesign({ id: "x", hero: "warpDrive" as never });
    expect(design.hero).toBe("fuelLevel");
  });

  it("drops a bar bound to something that cannot fill one", () => {
    // Odometer has no full point, so a bar would be meaningless.
    expect(normaliseDesign({ id: "x", bar: "odometer" }).bar).toBeNull();
    expect(normaliseDesign({ id: "x", bar: "fuelLevel" }).bar).toBe("fuelLevel");
  });

  it("falls back to a known palette", () => {
    expect(normaliseDesign({ id: "x", palette: "neon" as never }).palette).toBe("midnight");
  });

  it("caps the number of stat cells", () => {
    const design = normaliseDesign({
      id: "x",
      stats: ["odometer", "range", "fuelLevel", "todayCost", "monthCost", "voltage"],
    });
    expect(design.stats).toHaveLength(MAX_STATS);
  });

  it("discards junk in the stats list instead of rendering it", () => {
    const design = normaliseDesign({ id: "x", stats: ["odometer", 42, null, "nope"] as never });
    expect(design.stats).toEqual(["odometer"]);
  });

  it("survives a design object with nothing but an id", () => {
    const design = normaliseDesign({ id: "bare" });
    expect(design.hero).toBeTruthy();
    expect(design.stats).toEqual([]);
    expect(design.bar).toBeNull();
  });
});

describe("clampScale", () => {
  it("keeps the hero readable at both ends", () => {
    expect(clampScale(5)).toBe(MAX_HERO_SCALE);
    expect(clampScale(0.1)).toBe(MIN_HERO_SCALE);
    expect(clampScale(1.1)).toBe(1.1);
  });

  it("defaults anything that is not a number", () => {
    expect(clampScale(undefined)).toBe(1);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale("big")).toBe(1);
  });
});

describe("resolveDesign", () => {
  it("fills every slot from the readings", () => {
    const payload = resolveDesign(presetById("fuelRange")!, data(), NOW);
    expect(payload.header).toBe("BMW 320i");
    expect(payload.hero).toBe("62%");
    expect(payload.secondary).toBe("480 km");
    expect(payload.barPercent).toBe(62);
    expect(payload.stats.map((s) => s.value)).toContain("152340 km");
  });

  it("shows dashes for a reading the car has not given", () => {
    const payload = resolveDesign(presetById("vitals")!, data(), NOW);
    expect(payload.hero).toBe(NO_VALUE);
  });

  it("tells an empty bar apart from no bar at all", () => {
    // Zero would look like an empty tank on a car that reports no fuel level.
    const noBar = resolveDesign(normaliseDesign({ id: "x", bar: null }), data(), NOW);
    expect(noBar.barPercent).toBe(-1);

    const unknown = resolveDesign(
      normaliseDesign({ id: "x", bar: "fuelLevel" }),
      data({ fraction: {} }),
      NOW
    );
    expect(unknown.barPercent).toBe(-1);

    const empty = resolveDesign(
      normaliseDesign({ id: "x", bar: "fuelLevel" }),
      data({ fraction: { fuelLevel: 0 } }),
      NOW
    );
    expect(empty.barPercent).toBe(0);
  });

  it("clamps a fraction that came back out of range", () => {
    const over = resolveDesign(
      normaliseDesign({ id: "x", bar: "fuelLevel" }),
      data({ fraction: { fuelLevel: 1.4 } }),
      NOW
    );
    expect(over.barPercent).toBe(100);
  });

  it("renders an empty slot as blank, not as dashes", () => {
    // An intentionally empty slot is not a missing reading.
    const payload = resolveDesign(normaliseDesign({ id: "x", secondary: "empty" }), data(), NOW);
    expect(payload.secondary).toBe("");
  });

  it("carries the palette through so the renderer needs no colour knowledge", () => {
    const payload = resolveDesign(normaliseDesign({ id: "x", palette: "ember" }), data(), NOW);
    expect(payload.colors).toEqual(PALETTES.ember);
  });
});

describe("the built-in presets", () => {
  it("offers at least ten designs", () => {
    expect(WIDGET_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it("gives every preset a unique id and a name", () => {
    const ids = WIDGET_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WIDGET_PRESETS.every((p) => p.nameKey)).toBe(true);
  });

  it("survives normalisation unchanged — every preset is already valid", () => {
    for (const preset of WIDGET_PRESETS) {
      expect(normaliseDesign(preset)).toEqual(preset);
    }
  });

  it("renders every preset against empty data without throwing or blanking out", () => {
    // A widget placed before the adapter has ever connected must still draw.
    for (const preset of WIDGET_PRESETS) {
      const payload = resolveDesign(preset, emptyDataSet(), NOW);
      expect(payload.designId).toBe(preset.id);
      expect(typeof payload.hero).toBe("string");
      expect(payload.hero.length).toBeGreaterThan(0);
    }
  });

  it("does not build more than one preset around live-only readings", () => {
    // Those show dashes on a parked car; one such design is a deliberate
    // choice, several would make the gallery look broken.
    const liveHeroes = WIDGET_PRESETS.filter((p) => LIVE_ONLY.has(p.hero) && p.id !== "liveTrip");
    expect(liveHeroes.map((p) => p.id)).toEqual(["vitals"]);
  });

  it("resolves a default design", () => {
    expect(defaultDesign()).toBeDefined();
    expect(presetById("nope")).toBeUndefined();
  });

  it("varies the palettes rather than shipping twelve of the same card", () => {
    expect(new Set(WIDGET_PRESETS.map((p) => p.palette)).size).toBeGreaterThanOrEqual(4);
  });
});

describe("metricsUsedBy", () => {
  it("lists each metric once and leaves out empty slots", () => {
    const design: WidgetDesign = normaliseDesign({
      id: "x",
      header: "vehicleName",
      hero: "fuelLevel",
      secondary: "empty",
      bar: "fuelLevel",
      stats: ["odometer", "fuelLevel"],
    });
    const used = metricsUsedBy(design);
    expect(used).toContain("fuelLevel");
    expect(used).toContain("odometer");
    expect(used).not.toContain("empty");
    expect(used.filter((m) => m === "fuelLevel")).toHaveLength(1);
  });
});

describe("resolveMetric", () => {
  it("prefers a real value and falls back to dashes", () => {
    expect(resolveMetric("fuelLevel", data()).value).toBe("62%");
    expect(resolveMetric("voltage", data()).value).toBe(NO_VALUE);
  });

  it("treats an empty string as no value", () => {
    expect(resolveMetric("range", data({ text: { range: "" } })).value).toBe(NO_VALUE);
  });
});
