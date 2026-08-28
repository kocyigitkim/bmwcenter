/**
 * When each maintenance item is next due.
 *
 * An item can be governed by distance, by time, or by both — whichever falls
 * first wins, which is how every service book in the world states it. The
 * distance side is measured against the odometer reading shown to the user
 * (recorded distance plus the manual baseline), so a car adopted mid-life is
 * scheduled from its real mileage rather than from the day the app was
 * installed.
 *
 * An item that has never been recorded as done reports `unknown` rather than
 * guessing a service date. Inventing a baseline would put a confident "due in
 * 7 400 km" on the screen with nothing behind it.
 */

export type DueStatus = "unknown" | "ok" | "soon" | "due" | "overdue";

export interface MaintenanceScheduleInput {
  intervalKm: number | null;
  intervalMonths: number | null;
  lastDoneKm: number | null;
  lastDoneDate: number | null;
}

export interface DueContext {
  /** Odometer reading as displayed to the user, in km. */
  odometerKm: number;
  now: number;
}

export interface DueInfo {
  status: DueStatus;
  /** Distance left before the item is due; negative once overdue. */
  remainingKm?: number;
  /** Days left before the item is due; negative once overdue. */
  remainingDays?: number;
  /** Odometer reading at which it falls due. */
  dueAtKm?: number;
  /** Date on which it falls due. */
  dueAtDate?: number;
  /** 0..1 of the interval consumed, clamped at 1 for the progress bar. Uses
   * whichever of distance and time is further along. */
  progress: number;
  /** Which of the two limits is driving the status. */
  driver?: "distance" | "time";
}

const DAY_MS = 86_400_000;
/** Months are billed as calendar months; 30.44 days is the mean length. */
const MONTH_MS = 30.44 * DAY_MS;

/** Warn this far ahead so the user can book a slot rather than discover it late. */
const SOON_DAYS = 45;
const DUE_DAYS = 14;
/** Distance warnings scale with the interval — 1 000 km is early for a 60 000 km
 * spark plug change and late for a 10 000 km oil change — but are capped so a
 * long interval doesn't nag for months. */
const SOON_FRACTION = 0.15;
const DUE_FRACTION = 0.05;
const SOON_MAX_KM = 3000;
const DUE_MAX_KM = 1000;

function statusForKm(remainingKm: number, intervalKm: number): DueStatus {
  if (remainingKm < 0) return "overdue";
  if (remainingKm <= Math.min(intervalKm * DUE_FRACTION, DUE_MAX_KM)) return "due";
  if (remainingKm <= Math.min(intervalKm * SOON_FRACTION, SOON_MAX_KM)) return "soon";
  return "ok";
}

function statusForDays(remainingDays: number): DueStatus {
  if (remainingDays < 0) return "overdue";
  if (remainingDays <= DUE_DAYS) return "due";
  if (remainingDays <= SOON_DAYS) return "soon";
  return "ok";
}

const SEVERITY: Record<DueStatus, number> = { unknown: -1, ok: 0, soon: 1, due: 2, overdue: 3 };

export function isActionable(status: DueStatus): boolean {
  return status === "due" || status === "overdue";
}

/** Orders a list so the things needing attention are at the top. */
export function compareByUrgency(a: DueInfo, b: DueInfo): number {
  const bySeverity = SEVERITY[b.status] - SEVERITY[a.status];
  if (bySeverity !== 0) return bySeverity;
  return b.progress - a.progress;
}

export function computeDue(item: MaintenanceScheduleInput, ctx: DueContext): DueInfo {
  const hasKmRule = item.intervalKm != null && item.intervalKm > 0 && item.lastDoneKm != null;
  const hasTimeRule = item.intervalMonths != null && item.intervalMonths > 0 && item.lastDoneDate != null;

  if (!hasKmRule && !hasTimeRule) {
    return { status: "unknown", progress: 0 };
  }

  const info: DueInfo = { status: "ok", progress: 0 };
  let kmStatus: DueStatus | undefined;
  let kmProgress = 0;
  let timeStatus: DueStatus | undefined;
  let timeProgress = 0;

  if (hasKmRule) {
    const intervalKm = item.intervalKm!;
    const dueAtKm = item.lastDoneKm! + intervalKm;
    const remainingKm = dueAtKm - ctx.odometerKm;
    info.dueAtKm = dueAtKm;
    info.remainingKm = remainingKm;
    kmStatus = statusForKm(remainingKm, intervalKm);
    kmProgress = clamp01((intervalKm - remainingKm) / intervalKm);
  }

  if (hasTimeRule) {
    const intervalMs = item.intervalMonths! * MONTH_MS;
    const dueAtDate = item.lastDoneDate! + intervalMs;
    const remainingMs = dueAtDate - ctx.now;
    info.dueAtDate = dueAtDate;
    info.remainingDays = remainingMs / DAY_MS;
    timeStatus = statusForDays(info.remainingDays);
    timeProgress = clamp01((intervalMs - remainingMs) / intervalMs);
  }

  info.progress = Math.max(kmProgress, timeProgress);

  // Whichever limit is reached first governs the item; on equal severity the
  // one further through its interval is the honest one to show.
  const kmWins =
    kmStatus != null &&
    (timeStatus == null ||
      SEVERITY[kmStatus] > SEVERITY[timeStatus] ||
      (SEVERITY[kmStatus] === SEVERITY[timeStatus] && kmProgress >= timeProgress));

  if (kmWins) {
    info.status = kmStatus!;
    info.driver = "distance";
  } else if (timeStatus != null) {
    info.status = timeStatus;
    info.driver = "time";
  }

  return info;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
