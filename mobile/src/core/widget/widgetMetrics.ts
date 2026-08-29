/**
 * Everything a widget can show, and how to turn app state into it.
 *
 * A widget slot names a metric; this resolves that name into a label, a
 * formatted value and — where the number has a natural ceiling — a fraction for
 * the progress bar. Keeping the catalogue in one place means the designer, the
 * preview and the widget itself always agree on what "range" means.
 *
 * Resolution is pure: it takes an already-gathered snapshot rather than reading
 * stores, so every design can be checked against fixed data in a test.
 */

export type WidgetMetricId =
  | "vehicleName"
  | "fuelLevel"
  | "range"
  | "odometer"
  | "tripState"
  | "liveDistance"
  | "liveConsumption"
  | "liveDuration"
  | "lastTripDistance"
  | "lastTripConsumption"
  | "lastTripCost"
  | "lastTripWhen"
  | "todayDistance"
  | "todayCost"
  | "todayTrips"
  | "monthDistance"
  | "monthCost"
  | "businessDistance"
  | "businessShare"
  | "healthScore"
  | "healthGrade"
  | "nextServiceItem"
  | "nextServiceDue"
  | "coolant"
  | "voltage"
  | "engineLoad"
  | "speed"
  | "rpm"
  | "openFaults"
  | "empty";

/** What the publisher gathers once per write, for every design to draw from. */
export interface WidgetDataSet {
  vehicleName: string;
  /** Formatted strings, absent when the app cannot say. */
  text: Partial<Record<WidgetMetricId, string>>;
  /** 0..1 for metrics that fill a bar. */
  fraction: Partial<Record<WidgetMetricId, number>>;
  recording: boolean;
}

export interface ResolvedMetric {
  id: WidgetMetricId;
  /** i18n key for the metric's short label. */
  labelKey: string;
  value: string;
  fraction?: number;
}

/** Placeholder for a value the car or the app cannot supply. */
export const NO_VALUE = "--";

const LABEL_KEYS: Record<WidgetMetricId, string> = {
  vehicleName: "widget.metric.vehicleName",
  fuelLevel: "widget.metric.fuelLevel",
  range: "widget.metric.range",
  odometer: "widget.metric.odometer",
  tripState: "widget.metric.tripState",
  liveDistance: "widget.metric.liveDistance",
  liveConsumption: "widget.metric.liveConsumption",
  liveDuration: "widget.metric.liveDuration",
  lastTripDistance: "widget.metric.lastTripDistance",
  lastTripConsumption: "widget.metric.lastTripConsumption",
  lastTripCost: "widget.metric.lastTripCost",
  lastTripWhen: "widget.metric.lastTripWhen",
  todayDistance: "widget.metric.todayDistance",
  todayCost: "widget.metric.todayCost",
  todayTrips: "widget.metric.todayTrips",
  monthDistance: "widget.metric.monthDistance",
  monthCost: "widget.metric.monthCost",
  businessDistance: "widget.metric.businessDistance",
  businessShare: "widget.metric.businessShare",
  healthScore: "widget.metric.healthScore",
  healthGrade: "widget.metric.healthGrade",
  nextServiceItem: "widget.metric.nextServiceItem",
  nextServiceDue: "widget.metric.nextServiceDue",
  coolant: "widget.metric.coolant",
  voltage: "widget.metric.voltage",
  engineLoad: "widget.metric.engineLoad",
  speed: "widget.metric.speed",
  rpm: "widget.metric.rpm",
  openFaults: "widget.metric.openFaults",
  empty: "widget.metric.empty",
};

/**
 * Metrics that only mean anything with the adapter connected and the engine
 * running. A design built on these shows dashes when the car is parked, which
 * is honest but not much use as the hero of a home-screen widget — the
 * designer warns about it rather than forbidding it.
 */
export const LIVE_ONLY: ReadonlySet<WidgetMetricId> = new Set<WidgetMetricId>([
  "coolant",
  "voltage",
  "engineLoad",
  "speed",
  "rpm",
  "liveDistance",
  "liveConsumption",
  "liveDuration",
]);

/** Metrics whose value fills a bar naturally. */
export const BAR_CAPABLE: ReadonlySet<WidgetMetricId> = new Set<WidgetMetricId>([
  "fuelLevel",
  "healthScore",
  "nextServiceDue",
  "businessShare",
  "engineLoad",
  "coolant",
]);

export const ALL_METRICS: WidgetMetricId[] = Object.keys(LABEL_KEYS) as WidgetMetricId[];

export function labelKeyFor(metric: WidgetMetricId): string {
  return LABEL_KEYS[metric] ?? "widget.metric.empty";
}

export function isMetric(value: string): value is WidgetMetricId {
  return value in LABEL_KEYS;
}

export function resolveMetric(metric: WidgetMetricId, data: WidgetDataSet): ResolvedMetric {
  if (metric === "empty") {
    return { id: metric, labelKey: LABEL_KEYS.empty, value: "" };
  }
  if (metric === "vehicleName") {
    return { id: metric, labelKey: LABEL_KEYS.vehicleName, value: data.vehicleName || NO_VALUE };
  }

  const raw = data.text[metric];
  const fraction = data.fraction[metric];
  return {
    id: metric,
    labelKey: LABEL_KEYS[metric],
    // A metric the app cannot fill shows dashes rather than an empty gap, so a
    // widget never looks broken when the car simply has not reported.
    value: raw != null && raw !== "" ? raw : NO_VALUE,
    fraction: fraction != null && Number.isFinite(fraction) ? clamp01(fraction) : undefined,
  };
}

export function hasValue(resolved: ResolvedMetric): boolean {
  return resolved.value !== NO_VALUE && resolved.value !== "";
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** An empty data set, for previews and for the first write before any poll. */
export function emptyDataSet(vehicleName = "QuickCar"): WidgetDataSet {
  return { vehicleName, text: {}, fraction: {}, recording: false };
}
