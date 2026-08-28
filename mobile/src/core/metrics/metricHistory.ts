/**
 * Short-term history of live metrics, kept in memory for the current drive.
 *
 * The dashboard shows an instant value; a number alone hides whether coolant is
 * climbing or settling, whether fuel trim drifts under load, whether boost
 * holds. This keeps the last stretch of every metric the adapter reports so a
 * gauge can be opened into a graph.
 *
 * Storage is a pair of typed arrays per metric rather than an array of objects:
 * at one sample a second across thirty-odd PIDs, object churn during a drive is
 * exactly the kind of pressure that makes a recording session stutter. Buffers
 * are allocated on first sample, so PIDs the car does not support cost nothing.
 */

import type { VehicleSnapshot } from "../obd/vehicleSnapshot";

export type MetricKey = Exclude<keyof VehicleSnapshot, "timestamp">;

export interface MetricSample {
  t: number;
  value: number;
}

export interface MetricSeries {
  key: MetricKey;
  samples: MetricSample[];
  min: number;
  max: number;
  /** Mean over the retained window. */
  avg: number;
  first: number;
  last: number;
}

export class MetricRingBuffer {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private start = 0;
  private count = 0;

  constructor(
    readonly capacity: number,
    /** Samples closer together than this are dropped. */
    readonly minIntervalMs: number
  ) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Returns whether the sample was kept. */
  record(t: number, value: number): boolean {
    if (!Number.isFinite(value)) return false;
    if (this.count > 0) {
      const lastT = this.times[(this.start + this.count - 1) % this.capacity]!;
      // Clocks can step backwards (NTP, timezone changes); a sample from the
      // past would corrupt the ordering the chart relies on.
      if (t < lastT) return false;
      if (t - lastT < this.minIntervalMs) return false;
    }
    const index = (this.start + this.count) % this.capacity;
    this.times[index] = t;
    this.values[index] = value;
    if (this.count < this.capacity) this.count += 1;
    else this.start = (this.start + 1) % this.capacity;
    return true;
  }

  samples(): MetricSample[] {
    const out: MetricSample[] = new Array(this.count);
    for (let i = 0; i < this.count; i += 1) {
      const index = (this.start + i) % this.capacity;
      out[i] = { t: this.times[index]!, value: this.values[index]! };
    }
    return out;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}

/** One sample a second for half an hour — long enough to see a warm-up, short
 * enough to stay in memory without a thought. */
export const DEFAULT_CAPACITY = 1800;
export const DEFAULT_MIN_INTERVAL_MS = 1000;

export class MetricHistory {
  private readonly buffers = new Map<MetricKey, MetricRingBuffer>();

  constructor(
    private readonly capacity = DEFAULT_CAPACITY,
    private readonly minIntervalMs = DEFAULT_MIN_INTERVAL_MS
  ) {}

  /**
   * Records every numeric field the patch carries.
   *
   * Takes the poll's patch rather than the merged snapshot on purpose: the
   * snapshot keeps the last value of a PID that has stopped being reported, and
   * recording that again each cycle would draw a flat line the car never sent.
   */
  record(patch: Partial<VehicleSnapshot>, t = patch.timestamp ?? Date.now()): void {
    for (const [key, value] of Object.entries(patch)) {
      if (key === "timestamp") continue;
      if (typeof value !== "number") continue;
      this.bufferFor(key as MetricKey).record(t, value);
    }
  }

  /** Undefined when the metric has never been reported. */
  series(key: MetricKey): MetricSeries | undefined {
    const buffer = this.buffers.get(key);
    if (!buffer || buffer.size === 0) return undefined;
    return summarize(key, buffer.samples());
  }

  /** Metrics with anything recorded, in the order they were first seen. */
  recorded(): MetricKey[] {
    return [...this.buffers.keys()].filter((key) => (this.buffers.get(key)?.size ?? 0) > 0);
  }

  clear(): void {
    this.buffers.clear();
  }

  private bufferFor(key: MetricKey): MetricRingBuffer {
    const existing = this.buffers.get(key);
    if (existing) return existing;
    const created = new MetricRingBuffer(this.capacity, this.minIntervalMs);
    this.buffers.set(key, created);
    return created;
  }
}

export function summarize(key: MetricKey, samples: MetricSample[]): MetricSeries {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const s of samples) {
    if (s.value < min) min = s.value;
    if (s.value > max) max = s.value;
    sum += s.value;
  }
  return {
    key,
    samples,
    min,
    max,
    avg: samples.length > 0 ? sum / samples.length : 0,
    first: samples[0]?.value ?? 0,
    last: samples[samples.length - 1]?.value ?? 0,
  };
}

/**
 * Nice round bounds for the value axis, padded so the line never touches the
 * frame. A flat series still gets a band around it rather than a zero-height
 * axis that would put the line at an arbitrary height.
 */
export function axisBounds(min: number, max: number): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max - min < 1e-9) {
    const pad = Math.max(Math.abs(min) * 0.1, 1);
    return [min - pad, max + pad];
  }
  const pad = (max - min) * 0.12;
  return [min - pad, max + pad];
}

/**
 * Reduces a series to at most `maxPoints` by averaging within equal-width
 * buckets. Drawing 1 800 points into a 300 px chart costs more than it shows,
 * and averaging keeps the shape that dropping samples would alias away.
 */
export function downsample(samples: MetricSample[], maxPoints: number): MetricSample[] {
  if (maxPoints <= 0) return [];
  if (samples.length <= maxPoints) return samples;

  const out: MetricSample[] = [];
  const bucketSize = samples.length / maxPoints;
  for (let i = 0; i < maxPoints; i += 1) {
    const from = Math.floor(i * bucketSize);
    const to = Math.min(Math.floor((i + 1) * bucketSize), samples.length);
    if (to <= from) continue;
    let sumT = 0;
    let sumV = 0;
    for (let j = from; j < to; j += 1) {
      sumT += samples[j]!.t;
      sumV += samples[j]!.value;
    }
    out.push({ t: sumT / (to - from), value: sumV / (to - from) });
  }
  return out;
}

/** The app keeps one history for the drive in progress. */
export const metricHistory = new MetricHistory();
