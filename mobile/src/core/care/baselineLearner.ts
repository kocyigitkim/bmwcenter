import { eq } from "drizzle-orm";
import { db } from "../storage/db";
import { baselineMetrics } from "../storage/schema";

const HISTOGRAM_BINS = 128;
const HALF_LIFE_DAYS = 60;

interface CachedMetric {
  id: number;
  key: string;
  bucketKey: string;
  count: number;
  mean: number;
  m2: number;
  p50: number;
  p95: number;
  lastUpdated: number;
  isMature: boolean;
  bins: number[];
}

function compositeKey(key: string, bucket: string): string {
  return bucket ? `${key}|${bucket}` : key;
}

function percentiles(bins: number[], range: [number, number]): { p50: number; p95: number } {
  const total = bins.reduce((a, b) => a + b, 0);
  if (total === 0) return { p50: 0, p95: 0 };
  const [lo, hi] = range;
  const span = hi - lo;
  const valueAt = (q: number) => {
    const target = total * q;
    let acc = 0;
    for (let i = 0; i < bins.length; i++) {
      acc += bins[i]!;
      if (acc >= target) return lo + ((i + 0.5) / HISTOGRAM_BINS) * span;
    }
    return hi;
  };
  return { p50: valueAt(0.5), p95: valueAt(0.95) };
}

/** Online Welford mean/variance + 128-bin histogram for P50/P95, persisted to SQLite. */
class BaselineLearner {
  private cache = new Map<string, CachedMetric>();
  private loaded = false;

  private async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const rows = await db.select().from(baselineMetrics);
    for (const row of rows) {
      const ck = compositeKey(row.key, row.bucketKey);
      let bins: number[] = [];
      try {
        bins = row.histogramJSON ? JSON.parse(row.histogramJSON) : [];
      } catch {
        bins = [];
      }
      if (bins.length !== HISTOGRAM_BINS) bins = new Array(HISTOGRAM_BINS).fill(0);
      this.cache.set(ck, {
        id: row.id,
        key: row.key,
        bucketKey: row.bucketKey,
        count: row.count,
        mean: row.mean,
        m2: row.m2,
        p50: row.p50,
        p95: row.p95,
        lastUpdated: row.lastUpdated,
        isMature: row.isMature,
        bins,
      });
    }
  }

  async observe(
    key: string,
    value: number,
    bucketKey = "",
    minSamples = 60,
    range: [number, number] = [-50, 200],
    now = Date.now()
  ): Promise<void> {
    await this.ensureLoaded();
    const ck = compositeKey(key, bucketKey);
    let metric = this.cache.get(ck);
    if (!metric) {
      metric = { id: -1, key, bucketKey, count: 0, mean: 0, m2: 0, p50: 0, p95: 0, lastUpdated: now, isMature: false, bins: new Array(HISTOGRAM_BINS).fill(0) };
    }

    const ageDays = (now - metric.lastUpdated) / 86_400_000;
    if (ageDays > 1 && metric.count > 0) {
      const weight = Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
      if (weight < 0.99) {
        metric.m2 *= weight;
        metric.count = Math.max(1, Math.round(metric.count * weight));
      }
    }

    metric.count += 1;
    const delta = value - metric.mean;
    metric.mean += delta / metric.count;
    const delta2 = value - metric.mean;
    metric.m2 += delta * delta2;
    metric.lastUpdated = now;

    const [lo, hi] = range;
    const span = hi - lo;
    const clamped = Math.min(Math.max(value, lo), hi);
    const idx = Math.min(HISTOGRAM_BINS - 1, Math.max(0, Math.floor(((clamped - lo) / span) * HISTOGRAM_BINS)));
    metric.bins[idx] = (metric.bins[idx] ?? 0) + 1;

    const { p50, p95 } = percentiles(metric.bins, range);
    metric.p50 = p50;
    metric.p95 = p95;
    metric.isMature = metric.count >= minSamples;
    this.cache.set(ck, metric);

    const histogramJSON = JSON.stringify(metric.bins);
    if (metric.id === -1) {
      const inserted = await db
        .insert(baselineMetrics)
        .values({
          key,
          bucketKey,
          count: metric.count,
          mean: metric.mean,
          m2: metric.m2,
          p50,
          p95,
          lastUpdated: now,
          isMature: metric.isMature,
          histogramJSON,
        })
        .returning({ id: baselineMetrics.id });
      metric.id = inserted[0]?.id ?? -1;
    } else {
      await db
        .update(baselineMetrics)
        .set({ count: metric.count, mean: metric.mean, m2: metric.m2, p50, p95, lastUpdated: now, isMature: metric.isMature, histogramJSON })
        .where(eq(baselineMetrics.id, metric.id));
    }
  }

  snapshot(key: string, bucketKey = ""): CachedMetric | undefined {
    return this.cache.get(compositeKey(key, bucketKey));
  }

  isMature(key: string, bucketKey = "", minSamples = 60): boolean {
    const m = this.snapshot(key, bucketKey);
    return m != null && m.count >= minSamples;
  }

  async reset(keyPrefix?: string): Promise<void> {
    await this.ensureLoaded();
    const toDelete = [...this.cache.values()].filter((m) => !keyPrefix || m.key.startsWith(keyPrefix));
    for (const m of toDelete) {
      if (m.id !== -1) await db.delete(baselineMetrics).where(eq(baselineMetrics.id, m.id));
      this.cache.delete(compositeKey(m.key, m.bucketKey));
    }
  }
}

export const baselineLearner = new BaselineLearner();
