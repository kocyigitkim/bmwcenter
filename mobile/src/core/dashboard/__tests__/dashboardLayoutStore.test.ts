import { parseLayout } from "../dashboardLayoutStore";
import { factoryLayout } from "../dashboardLayout";

describe("parseLayout", () => {
  it("round-trips a customized layout", () => {
    const layout = { preset: "daily" as const, isCustomized: true, items: [{ id: "boost" as const, size: "hero" as const }] };
    const parsed = parseLayout(JSON.stringify({ ...layout, schemaVersion: 1 }));
    expect(parsed).toEqual(layout);
  });

  it("recovers a double-encoded legacy value instead of discarding it", () => {
    // The old appSettings writer stored JSON.stringify(JSON.stringify(layout)).
    const layout = factoryLayout("cooling");
    const doubleEncoded = JSON.stringify(JSON.stringify(layout));
    expect(parseLayout(doubleEncoded)).toEqual(layout);
  });

  it("returns undefined for corrupt or foreign values", () => {
    expect(parseLayout(undefined)).toBeUndefined();
    expect(parseLayout("not json")).toBeUndefined();
    expect(parseLayout(JSON.stringify({ nope: true }))).toBeUndefined();
    expect(parseLayout(JSON.stringify(42))).toBeUndefined();
  });

  it("drops unknown widget kinds and invalid sizes rather than failing the whole layout", () => {
    const parsed = parseLayout(
      JSON.stringify({
        preset: "daily",
        isCustomized: true,
        items: [
          { id: "speed", size: "hero" },
          { id: "notAWidget", size: "hero" },
          { id: "rpm", size: "gigantic" },
        ],
      })
    );
    expect(parsed?.items).toEqual([{ id: "speed", size: "hero" }]);
  });

  it("falls back to the daily preset when the stored preset is unknown", () => {
    const parsed = parseLayout(
      JSON.stringify({ preset: "spaceship", isCustomized: true, items: [{ id: "speed", size: "hero" }] })
    );
    expect(parsed?.preset).toBe("daily");
  });

  it("strips reserved pinned-chrome ids and duplicates", () => {
    const parsed = parseLayout(
      JSON.stringify({
        preset: "daily",
        isCustomized: true,
        items: [
          { id: "speed", size: "hero" },
          { id: "speed", size: "small" },
          { id: "trip", size: "small" },
        ],
      })
    );
    expect(parsed?.items).toEqual([{ id: "speed", size: "hero" }]);
  });
});
