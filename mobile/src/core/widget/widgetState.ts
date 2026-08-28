/**
 * What the home-screen widget shows.
 *
 * The widget renders strings and nothing else. Every unit conversion, currency
 * and consumption figure is worked out here, in the same code the app itself
 * uses, so the two can never disagree about what a number means — which is the
 * usual way a widget ends up quietly lying.
 */

export interface WidgetState {
  updatedAt: number;
  vehicleName: string;
  /** The headline: fuel level, or the live trip's distance while recording. */
  primary: string;
  /** The line under it: range, or the live consumption. */
  secondary: string;
  /** One line about the last completed drive. */
  trip: string;
  /** 0-100, or null when the car does not report a fuel level. */
  fuelLevelPct: number | null;
  recording: boolean;
}

export interface WidgetInput {
  now: number;
  vehicleName: string;
  fuelLevelPct?: number;
  /** Already formatted, e.g. "480 km". Undefined when it cannot be estimated. */
  rangeText?: string;
  fuelLevelText?: string;
  odometerText?: string;
  /** Present only while a trip is being recorded. */
  live?: {
    distanceText: string;
    consumptionText?: string;
  };
  lastTrip?: {
    distanceText: string;
    consumptionText?: string;
    endedAt: number;
  };
}

const DAY_MS = 86_400_000;

export function buildWidgetState(input: WidgetInput): WidgetState {
  const recording = input.live != null;

  return {
    updatedAt: input.now,
    vehicleName: input.vehicleName || "QuickCar",
    primary: recording ? input.live!.distanceText : input.fuelLevelText ?? "--",
    secondary: recording
      ? input.live!.consumptionText ?? ""
      : // Range is the useful thing next to a fuel level; the odometer is the
        // fallback because a car that does not report fuel still has mileage.
        input.rangeText ?? input.odometerText ?? "",
    trip: describeLastTrip(input),
    fuelLevelPct:
      input.fuelLevelPct != null && Number.isFinite(input.fuelLevelPct)
        ? Math.round(Math.min(Math.max(input.fuelLevelPct, 0), 100))
        : null,
    recording,
  };
}

function describeLastTrip(input: WidgetInput): string {
  const last = input.lastTrip;
  if (!last) return "";
  const parts = [last.distanceText, last.consumptionText].filter(Boolean);
  return parts.join("  ·  ");
}

/**
 * Whether the widget file is worth rewriting.
 *
 * A home-screen widget refreshes on its own schedule, so writing on every OBD
 * poll would be flash wear for nothing. Only a change the user could actually
 * see counts.
 */
export function isWorthWriting(previous: WidgetState | undefined, next: WidgetState): boolean {
  if (!previous) return true;
  return (
    previous.primary !== next.primary ||
    previous.secondary !== next.secondary ||
    previous.trip !== next.trip ||
    previous.vehicleName !== next.vehicleName ||
    previous.recording !== next.recording ||
    // The bar is drawn in whole percent, so smaller moves change nothing.
    previous.fuelLevelPct !== next.fuelLevelPct
  );
}

/** A trip from weeks ago is not news; the line is dropped rather than stale. */
export function isRecentEnough(endedAt: number, now: number, maxAgeDays = 14): boolean {
  return now - endedAt <= maxAgeDays * DAY_MS;
}
