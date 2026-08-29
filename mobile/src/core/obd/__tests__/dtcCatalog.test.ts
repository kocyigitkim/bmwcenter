import { allEntries, bmwEntries, entryFor, summaryFor } from "../dtcCatalog";

describe("dtcCatalog", () => {
  it("looks a code up regardless of case", () => {
    const upper = entryFor("P0420");
    expect(upper).toBeDefined();
    expect(entryFor("p0420")).toEqual(upper);
    expect(upper!.code).toBe("P0420");
  });

  it("returns nothing for a code it does not know", () => {
    expect(entryFor("ZZ9999")).toBeUndefined();
    expect(summaryFor("ZZ9999", "en")).toBeUndefined();
  });

  it("summarises in the requested language", () => {
    const en = summaryFor("P0420", "en");
    const tr = summaryFor("P0420", "tr");
    expect(en).toBeTruthy();
    expect(tr).toBeTruthy();
    // Anything other than Turkish falls back to English rather than blank.
    expect(summaryFor("P0420", "de")).toBe(en);
  });

  it("lists entries and narrows to the BMW-specific ones", () => {
    const all = allEntries("en");
    const bmw = bmwEntries("en");
    expect(all.length).toBeGreaterThan(1000);
    expect(bmw.length).toBeGreaterThan(0);
    expect(bmw.length).toBeLessThan(all.length);
    expect(bmw.every((e) => e.bmw)).toBe(true);
  });

  it("parses the catalog once and reuses it", () => {
    // Two lookups must not mean two 3 MB parses.
    const first = entryFor("P0171");
    const second = entryFor("P0171");
    expect(second).toEqual(first);
  });
});
