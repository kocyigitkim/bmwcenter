/**
 * The mileage log: which drives were for work, and what they cost.
 *
 * Every trip already carries a category — the recorder has been writing it
 * since the beginning and nothing has ever read it back. This turns that column
 * into the thing people actually need it for: a defensible monthly record of
 * business distance and its fuel cost, for an expense claim or a tax return.
 *
 * All of it is pure. The categorisation rule in particular decides what goes on
 * a document someone signs, so it has to be inspectable and testable rather
 * than buried in a screen.
 */

export type MileageCategory = "business" | "personal" | "other";

export const MILEAGE_CATEGORIES: MileageCategory[] = ["business", "personal", "other"];

export interface MileageTrip {
  id: string;
  startedAt: number;
  endedAt: number | null;
  distanceKm: number;
  fuelUsedL: number;
  category: string;
  startPlaceName: string | null;
  endPlaceName: string | null;
  note: string | null;
}

export function isMileageCategory(value: string): value is MileageCategory {
  return (MILEAGE_CATEGORIES as string[]).includes(value);
}

/** Anything unrecognised counts as personal: never claim a drive as business
 * on the strength of a value we do not understand. */
export function categoryOf(trip: Pick<MileageTrip, "category">): MileageCategory {
  return isMileageCategory(trip.category) ? trip.category : "personal";
}

// --- automatic rule --------------------------------------------------------

export interface AutoRule {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, matching Date.getDay(). */
  weekdays: number[];
  /** Minutes from local midnight. */
  fromMinute: number;
  toMinute: number;
  category: MileageCategory;
}

export const DEFAULT_AUTO_RULE: AutoRule = {
  enabled: false,
  weekdays: [1, 2, 3, 4, 5],
  fromMinute: 7 * 60,
  toMinute: 19 * 60,
  category: "business",
};

/**
 * What the rule would call a trip, or undefined when it does not apply.
 *
 * A window that wraps past midnight (22:00–02:00) is treated as one span, not
 * as an empty one — an evening shift is exactly the case someone would want a
 * rule for.
 */
export function ruleCategoryFor(rule: AutoRule, startedAt: number): MileageCategory | undefined {
  if (!rule.enabled) return undefined;
  const date = new Date(startedAt);
  if (!rule.weekdays.includes(date.getDay())) return undefined;

  const minute = date.getHours() * 60 + date.getMinutes();
  const inWindow =
    rule.fromMinute <= rule.toMinute
      ? minute >= rule.fromMinute && minute < rule.toMinute
      : minute >= rule.fromMinute || minute < rule.toMinute;

  return inWindow ? rule.category : undefined;
}

/**
 * Trips the rule would change, so the user can be shown what is about to happen
 * and confirm it. The rule never rewrites a category silently.
 */
export function tripsRuleWouldChange(rule: AutoRule, trips: MileageTrip[]): Array<{ id: string; to: MileageCategory }> {
  const out: Array<{ id: string; to: MileageCategory }> = [];
  for (const trip of trips) {
    const suggested = ruleCategoryFor(rule, trip.startedAt);
    if (suggested && categoryOf(trip) !== suggested) out.push({ id: trip.id, to: suggested });
  }
  return out;
}

// --- totals ----------------------------------------------------------------

export interface CategoryTotals {
  category: MileageCategory;
  tripCount: number;
  distanceKm: number;
  fuelUsedL: number;
  fuelCost: number;
}

export interface MileageSummary {
  from: number;
  to: number;
  byCategory: CategoryTotals[];
  totalDistanceKm: number;
  totalFuelCost: number;
  /** Business distance as a fraction of the total, 0 when nothing was driven. */
  businessShare: number;
}

/**
 * Costs each trip at the price per litre, and totals by category.
 *
 * Cost is derived from the fuel the trip actually used rather than from a
 * per-kilometre rate, because that is the figure the rest of the app computes
 * and can defend. A statutory per-km allowance is a different number that
 * varies by country and year; `allowanceFor` below keeps it separate and
 * explicit rather than quietly mixing the two.
 */
export function summarise(trips: MileageTrip[], pricePerLiter: number, from: number, to: number): MileageSummary {
  const totals = new Map<MileageCategory, CategoryTotals>();
  for (const category of MILEAGE_CATEGORIES) {
    totals.set(category, { category, tripCount: 0, distanceKm: 0, fuelUsedL: 0, fuelCost: 0 });
  }

  for (const trip of trips) {
    const bucket = totals.get(categoryOf(trip))!;
    bucket.tripCount += 1;
    bucket.distanceKm += trip.distanceKm;
    bucket.fuelUsedL += trip.fuelUsedL;
    bucket.fuelCost += trip.fuelUsedL * pricePerLiter;
  }

  const byCategory = MILEAGE_CATEGORIES.map((c) => totals.get(c)!);
  const totalDistanceKm = byCategory.reduce((sum, c) => sum + c.distanceKm, 0);
  const business = totals.get("business")!;

  return {
    from,
    to,
    byCategory,
    totalDistanceKm,
    totalFuelCost: byCategory.reduce((sum, c) => sum + c.fuelCost, 0),
    businessShare: totalDistanceKm > 0 ? business.distanceKm / totalDistanceKm : 0,
  };
}

/**
 * Distance priced at a per-kilometre allowance.
 *
 * Offered because most reimbursement schemes pay by the kilometre rather than
 * by fuel receipts, but the rate is the user's to supply: it is set by their
 * tax authority or employer and changes every year, so guessing one would put a
 * number on an expense claim that nobody here is in a position to stand behind.
 */
export function allowanceFor(distanceKm: number, ratePerKm: number): number {
  if (!(ratePerKm > 0) || !(distanceKm > 0)) return 0;
  return distanceKm * ratePerKm;
}

/** Trips within a window, most recent first. */
export function tripsInPeriod(trips: MileageTrip[], from: number, to: number): MileageTrip[] {
  return trips
    .filter((t) => t.startedAt >= from && t.startedAt < to)
    .sort((a, b) => b.startedAt - a.startedAt);
}

/** Start of the month containing `timestamp`, local time. */
export function startOfMonth(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfNextMonth(timestamp: number): number {
  const d = new Date(timestamp);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

/** The months that actually have trips, newest first — no empty months. */
export function monthsWithTrips(trips: MileageTrip[]): number[] {
  const months = new Set<number>();
  for (const trip of trips) months.add(startOfMonth(trip.startedAt));
  return [...months].sort((a, b) => b - a);
}

// --- CSV -------------------------------------------------------------------

const CSV_HEADER = "date,category,distance_km,fuel_l,fuel_cost,from,to,note";

function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** One row per trip, in the order an accountant would read them: oldest first. */
export function toCSV(trips: MileageTrip[], pricePerLiter: number, currencyCode: string): string {
  const rows = [CSV_HEADER.replace("fuel_cost", `fuel_cost_${currencyCode.toLowerCase()}`)];
  for (const trip of [...trips].sort((a, b) => a.startedAt - b.startedAt)) {
    rows.push(
      [
        new Date(trip.startedAt).toISOString(),
        categoryOf(trip),
        trip.distanceKm.toFixed(2),
        trip.fuelUsedL.toFixed(3),
        (trip.fuelUsedL * pricePerLiter).toFixed(2),
        csvField(trip.startPlaceName ?? ""),
        csvField(trip.endPlaceName ?? ""),
        csvField(trip.note ?? ""),
      ].join(",")
    );
  }
  return rows.join("\n");
}
