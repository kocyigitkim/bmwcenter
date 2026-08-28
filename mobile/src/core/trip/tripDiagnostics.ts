/**
 * What the car reported about itself during a drive.
 *
 * The scan screen answers "what is wrong now". This answers "what happened, and
 * under what conditions" — a code that sets at minute 40 of a motorway run with
 * the coolant at 104 °C is a different fault from the same code setting cold on
 * the driveway, and the freeze frame alone does not say which drive it came
 * from.
 *
 * Everything here is pure: the watcher that talks to the adapter and the screen
 * that draws the timeline both build on these.
 */

import type { FreezeFrameValues } from "../obd/freezeFrame";

export type DiagnosticEventKind = "code" | "milOn" | "milOff" | "milAlreadyOn";

export interface TripDiagnosticEvent {
  t: number;
  kind: DiagnosticEventKind;
  code?: string;
  status?: string;
  freezeFrame?: FreezeFrameValues;
  context?: Record<string, number>;
}

export interface ObservedCode {
  code: string;
  status: string;
}

/**
 * Codes present now that were not present before.
 *
 * Matched on the code alone, not the pair: a code promoted from pending to
 * stored is the same fault maturing, and reporting it twice would put the same
 * problem on the timeline as if it had happened again.
 */
export function newlySetCodes(previous: ObservedCode[], current: ObservedCode[]): ObservedCode[] {
  const seen = new Set(previous.map((c) => c.code));
  const fresh: ObservedCode[] = [];
  for (const candidate of current) {
    if (seen.has(candidate.code)) continue;
    seen.add(candidate.code); // the same code twice in one reply is still one fault
    fresh.push(candidate);
  }
  return fresh;
}

/**
 * MIL changes worth recording. Returns nothing while the state is unchanged.
 *
 * The first reading of a drive gets its own kind: a lamp that was already lit
 * belongs on the timeline, but calling that `milOn` would say it came on during
 * this drive, which is a different and more alarming claim.
 */
export function milTransition(previous: boolean | undefined, current: boolean): DiagnosticEventKind | undefined {
  if (previous === current) return undefined;
  if (previous === undefined) return current ? "milAlreadyOn" : undefined;
  return current ? "milOn" : "milOff";
}

export interface TimelineEntry {
  t: number;
  /** Seconds from the start of the trip. */
  offsetS: number;
  kind: DiagnosticEventKind | "protection";
  code?: string;
  status?: string;
  /** protection_events.type for protection entries. */
  type?: string;
  severity?: string;
  freezeFrame?: FreezeFrameValues;
}

export interface ProtectionEntry {
  t: number;
  type: string;
  severity: string;
}

/**
 * One ordered account of the drive, merging the codes the watcher caught with
 * the warnings the care watchdogs raised.
 */
export function buildTimeline(
  startedAt: number,
  diagnostics: TripDiagnosticEvent[],
  protection: ProtectionEntry[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...diagnostics.map((e) => ({
      t: e.t,
      offsetS: Math.max(0, Math.round((e.t - startedAt) / 1000)),
      kind: e.kind,
      code: e.code,
      status: e.status,
      freezeFrame: e.freezeFrame,
    })),
    ...protection.map((e) => ({
      t: e.t,
      offsetS: Math.max(0, Math.round((e.t - startedAt) / 1000)),
      kind: "protection" as const,
      type: e.type,
      severity: e.severity,
    })),
  ];
  return entries.sort((a, b) => a.t - b.t);
}

// --- sensor summary --------------------------------------------------------

/** A trip_samples row. Values are read by name and validated, because the row
 * also carries its id and trip id, and a column may be null. */
export interface SensorSample {
  t: number;
  [key: string]: unknown;
}

export interface SensorSummary {
  key: string;
  min: number;
  max: number;
  avg: number;
  count: number;
}

/**
 * Whether a column carries a real reading or just its default.
 *
 * The original sample columns are `NOT NULL DEFAULT 0`, so a PID the adapter
 * never answered is stored as a run of zeroes. A sensor that reads exactly zero
 * for an entire drive did not read — no engine holds 0 °C coolant and 0 % load
 * for forty minutes — so that is reported as absent rather than as a flat line
 * at the bottom of a graph.
 */
export function wasReported(values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    if (value !== 0) return true;
  }
  // Either nothing numeric at all, or an unbroken run of zeroes. Both mean the
  // car did not answer for this PID.
  return false;
}

/** Per-sensor min/avg/max over a trip, skipping sensors the car never reported. */
export function summarizeSensors(samples: SensorSample[], keys: string[]): SensorSummary[] {
  const out: SensorSummary[] = [];
  for (const key of keys) {
    const values = samples.map((s) => s[key]);
    if (!wasReported(values)) continue;

    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;
    for (const value of values) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
      sum += value;
      count += 1;
    }
    if (count === 0) continue;
    out.push({ key, min, max, avg: sum / count, count });
  }
  return out;
}

/** A sensor's readings as a series the chart can draw, gaps dropped. */
export function sensorSeries(samples: SensorSample[], key: string): Array<{ t: number; value: number }> {
  const series: Array<{ t: number; value: number }> = [];
  for (const sample of samples) {
    const value = sample[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    series.push({ t: sample.t, value });
  }
  return series;
}
