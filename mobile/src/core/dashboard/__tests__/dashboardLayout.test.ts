import {
  factoryLayout,
  itemsForPreset,
  sanitized,
  hideWidget,
  addWidget,
  setWidgetSize,
  moveBefore,
  moveOffset,
  applyPreset,
  placedKinds,
  packedRows,
  ALL_PRESETS,
} from "../dashboardLayout";
import { RESERVED_PINNED_CHROME_IDS, ALL_WIDGET_KINDS, EXTENDED_OEM } from "../dashboardWidgetKind";

describe("dashboardLayout", () => {
  test("daily factory contents", () => {
    const daily = factoryLayout("daily");
    expect(daily.preset).toBe("daily");
    expect(daily.isCustomized).toBe(false);
    expect(daily.items.map((i) => i.id)).toEqual(["speed", "rpm", "coolant", "fuelLevel", "voltage", "dailyFuel", "vehicleScan"]);
    expect(daily.items[0]!.size).toBe("hero");
    expect(daily.items[1]!.size).toBe("hero");
    expect(daily.items[2]!.size).toBe("small");
    expect(daily.items[6]!.size).toBe("hero");
  });

  test("daily excludes unsupported and extended PIDs", () => {
    const kinds = new Set(factoryLayout("daily").items.map((i) => i.id));
    const excluded = [
      "vanosIntake",
      "vanosExhaust",
      "fuelRail",
      "transmissionOilTemp",
      "boost",
      "boostSetpoint",
      "oilPressure",
      "map",
      "iat",
      "stft",
      "ltft",
      "intercooler",
      "radiatorOutlet",
      "batterySoc",
    ] as const;
    for (const kind of excluded) {
      expect(kinds.has(kind)).toBe(false);
    }
    for (const kind of kinds) {
      expect(EXTENDED_OEM.has(kind)).toBe(false);
    }
  });

  test("catalog includes map/iat/fuel trims", () => {
    const all = new Set(ALL_WIDGET_KINDS);
    expect(all.has("map")).toBe(true);
    expect(all.has("iat")).toBe(true);
    expect(all.has("stft")).toBe(true);
    expect(all.has("ltft")).toBe(true);
  });

  test("pinned chrome never appears in catalog or layout", () => {
    const catalogIds = new Set(ALL_WIDGET_KINDS as string[]);
    for (const id of RESERVED_PINNED_CHROME_IDS) {
      expect(catalogIds.has(id)).toBe(false);
    }
    for (const preset of ALL_PRESETS) {
      const ids = new Set(factoryLayout(preset).items.map((i) => i.id as string));
      for (const id of RESERVED_PINNED_CHROME_IDS) {
        expect(ids.has(id)).toBe(false);
      }
    }
  });

  test("daily packs speed/rpm as dual hero", () => {
    const rows = packedRows(factoryLayout("daily"));
    const first = rows[0]!;
    expect(first.kind).toBe("dualHero");
    if (first.kind === "dualHero") {
      expect(first.a.id).toBe("speed");
      expect(first.b.id).toBe("rpm");
    }
    expect(rows.some((r) => r.kind === "hero" && r.item.id === "vehicleScan")).toBe(true);
  });

  test("apply preset replaces customized layout", () => {
    let layout = factoryLayout("daily");
    layout = hideWidget(layout, "voltage");
    expect(layout.isCustomized).toBe(true);
    layout = applyPreset("performance");
    expect(layout.isCustomized).toBe(false);
    expect(layout.preset).toBe("performance");
    expect(layout.items.map((i) => i.id)).toEqual(["rpm", "boost", "boostSetpoint", "iat", "ignitionAdvance", "fuelRail"]);
    expect(layout.items.some((i) => i.id === "voltage")).toBe(false);
  });

  test("hide and reorder produce expected item order", () => {
    let layout = factoryLayout("daily");
    layout = hideWidget(layout, "voltage");
    layout = moveBefore(layout, "vehicleScan", "coolant");
    layout = setWidgetSize(layout, "fuelLevel", "hero");
    expect(layout.isCustomized).toBe(true);
    expect(layout.items.map((i) => i.id)).toEqual(["speed", "rpm", "vehicleScan", "coolant", "fuelLevel", "dailyFuel"]);
    expect(layout.items.find((i) => i.id === "fuelLevel")?.size).toBe("hero");
  });

  test("all presets have items with no duplicates", () => {
    for (const preset of ALL_PRESETS) {
      const layout = factoryLayout(preset);
      expect(layout.items.length).toBeGreaterThan(0);
      expect(new Set(layout.items.map((i) => i.id)).size).toBe(layout.items.length);
    }
  });

  test("fuel/diagnostics/cooling/turbo/transmission factories", () => {
    expect(itemsForPreset("fuel").map((i) => i.id)).toEqual(["instantConsumption", "dailyFuel", "fuelLevel", "range", "ecoScore"]);
    expect(itemsForPreset("diagnostics").some((i) => i.id === "stft")).toBe(true);
    expect(itemsForPreset("cooling").some((i) => i.id === "oilTemp")).toBe(true);
    expect(itemsForPreset("turbo")[0]!.id).toBe("boost");
    expect(itemsForPreset("transmission")[0]!.id).toBe("transmissionOilTemp");
  });

  test("add/sanitize/move offset", () => {
    let layout = factoryLayout("daily");
    layout = addWidget(layout, "voltage");
    expect(layout.items.filter((i) => i.id === "voltage")).toHaveLength(1);
    layout = addWidget(layout, "map");
    expect(layout.isCustomized).toBe(true);
    expect(layout.items.some((i) => i.id === "map")).toBe(true);

    const mapIndex = layout.items.findIndex((i) => i.id === "map");
    layout = moveOffset(layout, "map", -1);
    expect(layout.items.findIndex((i) => i.id === "map")).toBe(mapIndex - 1);

    layout.items.push({ id: "speed", size: "small" });
    layout.items.unshift({ id: "speed", size: "hero" });
    const clean = sanitized(layout);
    expect(clean.items.filter((i) => i.id === "speed")).toHaveLength(1);
  });

  test("placedKinds reflects current items", () => {
    const layout = factoryLayout("fuel");
    const kinds = placedKinds(layout);
    expect(kinds.has("instantConsumption")).toBe(true);
    expect(kinds.has("speed")).toBe(false);
  });
});
