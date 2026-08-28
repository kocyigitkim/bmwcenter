import { speedCalibrator, SPEED_CAL_REQUIRED_SAMPLES } from "../speedCalibrator";
import { storage, useAppSettings } from "../../settings/appSettings";

const goodFix = { latitude: 41, longitude: 29, accuracy: 4, gpsSpeedMs: 100 / 3.6, timestamp: 0 };

function drive(obdKmh: number, gpsKmh: number, count: number, startT: number) {
  let t = startT;
  for (let i = 0; i < count; i++) {
    t += 1000;
    // Two same-speed pre-samples so the 5s steadiness window is satisfied.
    speedCalibrator.ingest(obdKmh, undefined, t - 500);
    speedCalibrator.ingest(obdKmh, { ...goodFix, gpsSpeedMs: gpsKmh / 3.6 }, t);
  }
}

describe("speedCalibrator", () => {
  beforeEach(() => {
    speedCalibrator.reset();
  });

  it("accepts only steady, high-speed samples with a good GPS fix", () => {
    let t = 1_000_000;
    // Low speed — rejected.
    speedCalibrator.ingest(30, goodFix, (t += 1000));
    // Bad accuracy — rejected.
    speedCalibrator.ingest(100, { ...goodFix, accuracy: 30 }, (t += 1000));
    expect(speedCalibrator.sampleCount).toBe(0);

    // Clear of the 5s steadiness window that still contains the 30 km/h sample.
    drive(100, 96, 5, t + 10_000);
    expect(speedCalibrator.sampleCount).toBe(5);
  });

  it("persists progress so a restart does not lose it", () => {
    drive(100, 95, 8, 2_000_000);
    const raw = storage.getString("speedCal.samples");
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toHaveLength(8);
  });

  it("starts adjusting the factor before full calibration and clamps it", () => {
    // GPS consistently reads 5% below OBD -> factor should move toward 0.95.
    drive(100, 95, 15, 3_000_000);
    expect(useAppSettings.getState().speedCalibrationFactor).toBeCloseTo(0.95, 2);
  });

  it("stops collecting at the required count and reports calibrated", () => {
    drive(100, 96, SPEED_CAL_REQUIRED_SAMPLES + 20, 4_000_000);
    expect(speedCalibrator.sampleCount).toBe(SPEED_CAL_REQUIRED_SAMPLES);
    expect(speedCalibrator.isCalibrated).toBe(true);
    expect(speedCalibrator.progress).toBe(1);
  });

  it("reset clears samples, storage and the factor", () => {
    drive(100, 95, 20, 5_000_000);
    speedCalibrator.reset();
    expect(speedCalibrator.sampleCount).toBe(0);
    expect(storage.getString("speedCal.samples")).toBeUndefined();
    expect(useAppSettings.getState().speedCalibrationFactor).toBe(1.0);
  });
});
