import { storage, useAppSettings } from "../settings/appSettings";
import type { SimpleLocation } from "../trip/locationProvider";

interface OBDSample {
  t: number;
  speedKmh: number;
}

export const SPEED_CAL_REQUIRED_SAMPLES = 60;
/** Start nudging the factor once there is a usable median, well before "done". */
const MIN_SAMPLES_FOR_FACTOR = 15;
const STORAGE_KEY = "speedCal.samples";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Learns the OBD-vs-GPS speed ratio from steady highway cruising with a good fix.
 *
 * Progress is persisted: collecting 60 qualifying samples typically spans several
 * drives, and losing the tally on every app restart made the calibration look
 * permanently stuck at zero.
 */
class SpeedCalibrator {
  private samples: number[] = [];
  private recentOBD: OBDSample[] = [];

  constructor() {
    try {
      const raw = storage.getString(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as unknown) : undefined;
      if (Array.isArray(parsed)) {
        this.samples = parsed.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      }
    } catch {
      this.samples = [];
    }
  }

  ingest(obdSpeedKmh: number, location: SimpleLocation | undefined, now = Date.now()) {
    this.recentOBD.push({ t: now, speedKmh: obdSpeedKmh });
    if (this.recentOBD.length > 20) this.recentOBD.splice(0, this.recentOBD.length - 20);
    if (this.samples.length >= SPEED_CAL_REQUIRED_SAMPLES) return;
    if (!location || location.accuracy == null || !(location.accuracy > 0 && location.accuracy < 10)) return;
    if (!(obdSpeedKmh > 50)) return;
    const window = this.recentOBD.filter((s) => now - s.t <= 5000);
    if (window.length < 2) return;
    const speeds = window.map((s) => s.speedKmh);
    if (Math.max(...speeds) - Math.min(...speeds) >= 2) return;
    const gps = (location.gpsSpeedMs ?? -1) >= 0 ? (location.gpsSpeedMs ?? 0) * 3.6 : 0;
    if (!(Math.abs(obdSpeedKmh - gps) < 15) || !(gps > 0)) return;

    this.samples.push(gps / obdSpeedKmh);
    this.persist();

    if (this.samples.length >= MIN_SAMPLES_FOR_FACTOR && this.samples.length % 15 === 0) {
      const m = median(this.samples);
      useAppSettings.getState().set("speedCalibrationFactor", Math.min(Math.max(m, 0.85), 1.1));
    }
  }

  private persist() {
    try {
      storage.set(STORAGE_KEY, JSON.stringify(this.samples));
    } catch {
      // Progress persistence is best-effort; calibration still works in-session.
    }
  }

  reset() {
    this.samples = [];
    storage.remove(STORAGE_KEY);
    useAppSettings.getState().set("speedCalibrationFactor", 1.0);
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  get requiredSamples(): number {
    return SPEED_CAL_REQUIRED_SAMPLES;
  }

  get progress(): number {
    return Math.min(this.samples.length / SPEED_CAL_REQUIRED_SAMPLES, 1);
  }

  get isCalibrated(): boolean {
    return this.samples.length >= SPEED_CAL_REQUIRED_SAMPLES;
  }
}

export const speedCalibrator = new SpeedCalibrator();
