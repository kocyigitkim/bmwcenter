/**
 * The built-in widget designs.
 *
 * Each answers one question a driver actually asks at a glance, rather than
 * being a rearrangement of the same numbers: how far can I go, what did that
 * drive cost, is the car due for anything, how much of this month was work.
 *
 * A preset is only data — the same shape the designer produces — so the user
 * can start from any of these and change it.
 */

import { normaliseDesign, type WidgetDesign } from "./widgetDesign";

function preset(design: Omit<WidgetDesign, "heroScale"> & { heroScale?: number }): WidgetDesign {
  return normaliseDesign({ heroScale: 1, ...design });
}

export const WIDGET_PRESETS: WidgetDesign[] = [
  // 1. What most people want: how much fuel, how far it goes.
  preset({
    id: "fuelRange",
    nameKey: "widget.preset.fuelRange",
    palette: "midnight",
    accentStripe: false,
    header: "vehicleName",
    hero: "fuelLevel",
    secondary: "range",
    bar: "fuelLevel",
    stats: ["odometer", "lastTripDistance"],
  }),

  // 2. The same data with range as the headline — for people who think in
  //    distance rather than in percent.
  preset({
    id: "rangeFirst",
    nameKey: "widget.preset.rangeFirst",
    palette: "blueprint",
    accentStripe: true,
    header: "vehicleName",
    hero: "range",
    secondary: "fuelLevel",
    bar: "fuelLevel",
    stats: ["todayDistance", "lastTripConsumption"],
    heroScale: 0.95,
  }),

  // 3. Nothing but the number, as large as it goes.
  preset({
    id: "minimalFuel",
    nameKey: "widget.preset.minimalFuel",
    palette: "graphite",
    accentStripe: false,
    header: "empty",
    hero: "fuelLevel",
    secondary: "empty",
    bar: "fuelLevel",
    stats: [],
    heroScale: 1.5,
  }),

  // 4. For anyone tracking mileage against a service book.
  preset({
    id: "odometer",
    nameKey: "widget.preset.odometer",
    palette: "paper",
    accentStripe: false,
    header: "vehicleName",
    hero: "odometer",
    secondary: "nextServiceItem",
    bar: null,
    stats: ["nextServiceDue", "monthDistance"],
    heroScale: 0.9,
  }),

  // 5. How the last drive went, without opening the app.
  preset({
    id: "lastDrive",
    nameKey: "widget.preset.lastDrive",
    palette: "midnight",
    accentStripe: true,
    header: "lastTripWhen",
    hero: "lastTripDistance",
    secondary: "lastTripConsumption",
    bar: null,
    stats: ["lastTripCost", "todayDistance"],
  }),

  // 6. Today at a glance — the shape a daily driver checks in the evening.
  preset({
    id: "today",
    nameKey: "widget.preset.today",
    palette: "forest",
    accentStripe: false,
    header: "vehicleName",
    hero: "todayDistance",
    secondary: "todayCost",
    bar: null,
    stats: ["todayTrips", "lastTripConsumption"],
  }),

  // 7. The health score, which is otherwise two taps away.
  preset({
    id: "health",
    nameKey: "widget.preset.health",
    palette: "graphite",
    accentStripe: true,
    header: "vehicleName",
    hero: "healthScore",
    secondary: "healthGrade",
    bar: "healthScore",
    stats: ["openFaults", "nextServiceItem"],
  }),

  // 8. What is due next, for a car that gets serviced on time.
  preset({
    id: "service",
    nameKey: "widget.preset.service",
    palette: "ember",
    accentStripe: true,
    header: "nextServiceItem",
    hero: "nextServiceDue",
    secondary: "odometer",
    bar: "nextServiceDue",
    stats: ["healthScore", "openFaults"],
    heroScale: 0.95,
  }),

  // 9. Running cost, for anyone watching what the car actually costs.
  preset({
    id: "cost",
    nameKey: "widget.preset.cost",
    palette: "paper",
    accentStripe: false,
    header: "vehicleName",
    hero: "monthCost",
    secondary: "monthDistance",
    bar: null,
    stats: ["todayCost", "lastTripConsumption"],
    heroScale: 0.95,
  }),

  // 10. The mileage log's headline, for people claiming expenses.
  preset({
    id: "business",
    nameKey: "widget.preset.business",
    palette: "blueprint",
    accentStripe: false,
    header: "vehicleName",
    hero: "businessDistance",
    secondary: "businessShare",
    bar: "businessShare",
    stats: ["monthDistance", "monthCost"],
    heroScale: 0.95,
  }),

  // 11. Live engine readings. Shows dashes when parked, which is the point:
  //     it is for someone who leaves the adapter plugged in.
  preset({
    id: "vitals",
    nameKey: "widget.preset.vitals",
    palette: "ember",
    accentStripe: true,
    header: "vehicleName",
    hero: "coolant",
    secondary: "voltage",
    bar: "coolant",
    stats: ["engineLoad", "rpm"],
  }),

  // 12. The drive in progress, falling back to the last one when parked.
  preset({
    id: "liveTrip",
    nameKey: "widget.preset.liveTrip",
    palette: "midnight",
    accentStripe: true,
    header: "tripState",
    hero: "liveDistance",
    secondary: "liveConsumption",
    bar: null,
    stats: ["liveDuration", "speed"],
  }),
];

export const DEFAULT_DESIGN_ID = "fuelRange";

export function presetById(id: string): WidgetDesign | undefined {
  return WIDGET_PRESETS.find((p) => p.id === id);
}

/** The design a slot falls back to when nothing has been chosen. */
export function defaultDesign(): WidgetDesign {
  return presetById(DEFAULT_DESIGN_ID) ?? WIDGET_PRESETS[0]!;
}
