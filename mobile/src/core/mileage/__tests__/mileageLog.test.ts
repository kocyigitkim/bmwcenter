import {
  allowanceFor,
  categoryOf,
  monthsWithTrips,
  ruleCategoryFor,
  startOfMonth,
  startOfNextMonth,
  summarise,
  toCSV,
  tripsInPeriod,
  tripsRuleWouldChange,
  DEFAULT_AUTO_RULE,
  type AutoRule,
  type MileageTrip,
} from "../mileageLog";

let counter = 0;

function trip(over: Partial<MileageTrip> = {}): MileageTrip {
  counter += 1;
  return {
    id: `t${counter}`,
    startedAt: new Date(2026, 5, 10, 9, 0).getTime(),
    endedAt: new Date(2026, 5, 10, 9, 30).getTime(),
    distanceKm: 20,
    fuelUsedL: 1.6,
    category: "personal",
    startPlaceName: null,
    endPlaceName: null,
    note: null,
    ...over,
  };
}

describe("categoryOf", () => {
  it("reads the three known categories", () => {
    expect(categoryOf({ category: "business" })).toBe("business");
    expect(categoryOf({ category: "other" })).toBe("other");
  });

  it("never claims a drive as business on a value it does not understand", () => {
    expect(categoryOf({ category: "" })).toBe("personal");
    expect(categoryOf({ category: "commute" })).toBe("personal");
    expect(categoryOf({ category: "BUSINESS" })).toBe("personal");
  });
});

describe("ruleCategoryFor", () => {
  const rule: AutoRule = { ...DEFAULT_AUTO_RULE, enabled: true };

  it("does nothing while switched off", () => {
    expect(ruleCategoryFor({ ...rule, enabled: false }, trip().startedAt)).toBeUndefined();
  });

  it("applies on a listed weekday inside the window", () => {
    // 2026-06-10 is a Wednesday, 09:00.
    expect(ruleCategoryFor(rule, new Date(2026, 5, 10, 9, 0).getTime())).toBe("business");
  });

  it("skips days the rule does not list", () => {
    // 2026-06-13 is a Saturday.
    expect(ruleCategoryFor(rule, new Date(2026, 5, 13, 9, 0).getTime())).toBeUndefined();
  });

  it("skips times outside the window, and treats the end as exclusive", () => {
    expect(ruleCategoryFor(rule, new Date(2026, 5, 10, 6, 59).getTime())).toBeUndefined();
    expect(ruleCategoryFor(rule, new Date(2026, 5, 10, 19, 0).getTime())).toBeUndefined();
    expect(ruleCategoryFor(rule, new Date(2026, 5, 10, 18, 59).getTime())).toBe("business");
  });

  it("handles a window that wraps past midnight", () => {
    // An evening shift, 22:00 to 02:00 — the case a rule is most wanted for.
    const night: AutoRule = { ...rule, fromMinute: 22 * 60, toMinute: 2 * 60 };
    expect(ruleCategoryFor(night, new Date(2026, 5, 10, 23, 30).getTime())).toBe("business");
    expect(ruleCategoryFor(night, new Date(2026, 5, 10, 1, 30).getTime())).toBe("business");
    expect(ruleCategoryFor(night, new Date(2026, 5, 10, 12, 0).getTime())).toBeUndefined();
  });
});

describe("tripsRuleWouldChange", () => {
  const rule: AutoRule = { ...DEFAULT_AUTO_RULE, enabled: true };

  it("lists only the trips whose category would actually move", () => {
    const weekdayPersonal = trip({ startedAt: new Date(2026, 5, 10, 9).getTime(), category: "personal" });
    const weekdayAlreadyBusiness = trip({ startedAt: new Date(2026, 5, 10, 10).getTime(), category: "business" });
    const weekend = trip({ startedAt: new Date(2026, 5, 13, 9).getTime(), category: "personal" });

    const changes = tripsRuleWouldChange(rule, [weekdayPersonal, weekdayAlreadyBusiness, weekend]);
    expect(changes).toEqual([{ id: weekdayPersonal.id, to: "business" }]);
  });

  it("changes nothing when the rule is off", () => {
    expect(tripsRuleWouldChange({ ...rule, enabled: false }, [trip()])).toEqual([]);
  });
});

describe("summarise", () => {
  const price = 45;

  it("totals distance, fuel and cost per category", () => {
    const summary = summarise(
      [
        trip({ category: "business", distanceKm: 100, fuelUsedL: 8 }),
        trip({ category: "business", distanceKm: 50, fuelUsedL: 4 }),
        trip({ category: "personal", distanceKm: 50, fuelUsedL: 5 }),
      ],
      price,
      0,
      1
    );
    const business = summary.byCategory.find((c) => c.category === "business")!;
    expect(business.tripCount).toBe(2);
    expect(business.distanceKm).toBe(150);
    expect(business.fuelUsedL).toBe(12);
    expect(business.fuelCost).toBeCloseTo(540, 5);
    expect(summary.totalDistanceKm).toBe(200);
    expect(summary.businessShare).toBeCloseTo(0.75, 5);
  });

  it("always reports every category, even the empty ones", () => {
    const summary = summarise([trip({ category: "business" })], price, 0, 1);
    expect(summary.byCategory.map((c) => c.category)).toEqual(["business", "personal", "other"]);
    expect(summary.byCategory.find((c) => c.category === "other")!.tripCount).toBe(0);
  });

  it("reports a zero share rather than dividing by zero", () => {
    const summary = summarise([], price, 0, 1);
    expect(summary.businessShare).toBe(0);
    expect(summary.totalFuelCost).toBe(0);
  });

  it("counts an unrecognised category as personal, not as business", () => {
    const summary = summarise([trip({ category: "nonsense", distanceKm: 30 })], price, 0, 1);
    expect(summary.byCategory.find((c) => c.category === "personal")!.distanceKm).toBe(30);
    expect(summary.businessShare).toBe(0);
  });
});

describe("allowanceFor", () => {
  it("prices distance at the rate the user supplied", () => {
    expect(allowanceFor(150, 7.5)).toBeCloseTo(1125, 5);
  });

  it("returns zero rather than guessing when there is no rate", () => {
    expect(allowanceFor(150, 0)).toBe(0);
    expect(allowanceFor(150, -1)).toBe(0);
    expect(allowanceFor(0, 7.5)).toBe(0);
  });
});

describe("periods", () => {
  it("selects trips inside the window, newest first, end exclusive", () => {
    const from = new Date(2026, 5, 1).getTime();
    const to = new Date(2026, 6, 1).getTime();
    const inside = trip({ startedAt: new Date(2026, 5, 15).getTime() });
    const later = trip({ startedAt: new Date(2026, 5, 20).getTime() });
    const onBoundary = trip({ startedAt: to });
    const before = trip({ startedAt: new Date(2026, 4, 30).getTime() });

    const selected = tripsInPeriod([inside, later, onBoundary, before], from, to);
    expect(selected.map((t) => t.id)).toEqual([later.id, inside.id]);
  });

  it("finds month bounds in local time", () => {
    const mid = new Date(2026, 5, 17, 14, 30).getTime();
    expect(new Date(startOfMonth(mid)).getDate()).toBe(1);
    expect(new Date(startOfMonth(mid)).getHours()).toBe(0);
    expect(new Date(startOfNextMonth(mid)).getMonth()).toBe(6);
  });

  it("rolls a December month end into the next year", () => {
    const december = new Date(2026, 11, 20).getTime();
    const next = new Date(startOfNextMonth(december));
    expect(next.getFullYear()).toBe(2027);
    expect(next.getMonth()).toBe(0);
  });

  it("lists only months that have trips, newest first", () => {
    const months = monthsWithTrips([
      trip({ startedAt: new Date(2026, 3, 4).getTime() }),
      trip({ startedAt: new Date(2026, 5, 9).getTime() }),
      trip({ startedAt: new Date(2026, 5, 20).getTime() }),
    ]);
    expect(months).toHaveLength(2);
    expect(months[0]).toBe(startOfMonth(new Date(2026, 5, 1).getTime()));
  });
});

describe("toCSV", () => {
  it("writes a header and one row per trip, oldest first", () => {
    const rows = toCSV(
      [
        trip({ startedAt: new Date(2026, 5, 20).getTime(), category: "business" }),
        trip({ startedAt: new Date(2026, 5, 10).getTime(), category: "personal" }),
      ],
      45,
      "TRY"
    ).split("\n");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("fuel_cost_try");
    expect(rows[1]).toContain("personal");
    expect(rows[2]).toContain("business");
  });

  it("quotes free text so a comma in a place name cannot shift the columns", () => {
    const csv = toCSV([trip({ startPlaceName: "Kadıköy, İstanbul", note: 'said "urgent"' })], 45, "TRY");
    expect(csv).toContain('"Kadıköy, İstanbul"');
    expect(csv).toContain('"said ""urgent"""');
  });

  it("leaves missing text as empty fields rather than the word null", () => {
    const csv = toCSV([trip()], 45, "TRY");
    expect(csv).not.toContain("null");
  });
});
