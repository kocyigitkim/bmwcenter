import { useAppSettings } from "../settings/appSettings";
import type { SimpleLocation } from "../trip/locationProvider";

interface OBDSample {
  t: number;
  speedKmh: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

class SpeedCalibrator {
  private samples: number[] = [];
  private recentOBD: OBDSample[] = [];

  ingest(obdSpeedKmh: number, location: SimpleLocation | undefined, now = Date.now()) {
    this.recentOBD.push({ t: now, speedKmh: obdSpeedKmh });
    if (this.recentOBD.length > 20) this.recentOBD.splice(0, this.recentOBD.length - 20);
    if (!location || location.accuracy == null || !(location.accuracy > 0 && location.accuracy < 10)) return;
    if (!(obdSpeedKmh > 50)) return;
    const window = this.recentOBD.filter((s) => now - s.t <= 5000);
    if (window.length < 2) return;
    const speeds = window.map((s) => s.speedKmh);
    if (Math.max(...speeds) - Math.min(...speeds) >= 2) return;
    const gps = (location.gpsSpeedMs ?? -1) >= 0 ? (location.gpsSpeedMs ?? 0) * 3.6 : 0;
    if (!(Math.abs(obdSpeedKmh - gps) < 15) || !(gps > 0)) return;
    this.samples.push(gps / obdSpeedKmh);
    if (this.samples.length >= 60) {
      const m = median(this.samples);
      useAppSettings.getState().set("speedCalibrationFactor", Math.min(Math.max(m, 0.85), 1.1));
    }
  }

  reset() {
    this.samples = [];
    useAppSettings.getState().set("speedCalibrationFactor", 1.0);
  }

  get sampleCount(): number {
    return this.samples.length;
  }
}

export const speedCalibrator = new SpeedCalibrator();
