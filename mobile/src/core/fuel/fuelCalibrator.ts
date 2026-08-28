import { db } from "../storage/db";
import { calibrationSamples } from "../storage/schema";
import { fuelRepository } from "../storage/fuelRepository";
import { tripRepository } from "../storage/tripRepository";
import { storage, useAppSettings } from "../settings/appSettings";

export const FUEL_CAL_REQUIRED_SAMPLES = 2;
const MIN_CALCULATED_L = 15;
const MIN_DISTANCE_KM = 150;

/** Each full-tank pair may be evaluated once. Without this, every evaluation call
 * re-inserted a sample row for the same pair — duplicate rows, and "calibrated"
 * after visiting the calibration screen twice with a single pair. */
const LAST_PAIR_KEY = "fuelCal.lastEvaluatedPairId";

export type FuelSampleRejection = "distance" | "fuel" | "factorRange";

export interface FuelCalSample {
  date: number;
  measuredL: number;
  calculatedL: number;
  distanceKm: number;
  rawFactor: number;
  accepted: boolean;
  rejection?: FuelSampleRejection;
}

export interface FuelCalStatus {
  acceptedCount: number;
  requiredCount: number;
  factor: number;
  isCalibrated: boolean;
  lastSample?: FuelCalSample;
}

function rejectionFor(calculatedL: number, distanceKm: number, raw: number): FuelSampleRejection | undefined {
  if (!(distanceKm > MIN_DISTANCE_KM)) return "distance";
  if (!(calculatedL > MIN_CALCULATED_L)) return "fuel";
  if (!(raw >= 0.6 && raw <= 1.6)) return "factorRange";
  return undefined;
}

async function insertSample(sample: Omit<FuelCalSample, "rejection">) {
  await db.insert(calibrationSamples).values({
    date: sample.date,
    measuredL: sample.measuredL,
    calculatedL: sample.calculatedL,
    distanceKm: sample.distanceKm,
    rawFactor: sample.rawFactor,
    accepted: sample.accepted,
  });
}

export const fuelCalibrator = {
  async status(): Promise<FuelCalStatus> {
    const rows = await db.select().from(calibrationSamples);
    const acceptedCount = rows.filter((r) => r.accepted).length;
    const last = rows.length ? rows.reduce((a, b) => (b.date > a.date ? b : a)) : undefined;
    const settings = useAppSettings.getState();
    return {
      acceptedCount,
      requiredCount: FUEL_CAL_REQUIRED_SAMPLES,
      factor: settings.fuelCalibrationFactor,
      isCalibrated: acceptedCount >= FUEL_CAL_REQUIRED_SAMPLES,
      lastSample: last
        ? {
            date: last.date,
            measuredL: last.measuredL,
            calculatedL: last.calculatedL,
            distanceKm: last.distanceKm,
            rawFactor: last.rawFactor,
            accepted: last.accepted,
            rejection: last.accepted
              ? undefined
              : rejectionFor(last.calculatedL, last.distanceKm, last.rawFactor),
          }
        : undefined,
    };
  },

  /** Evaluates the newest pair of full-tank refuels, exactly once per pair.
   * Called when a refuel is logged; safe to also call from the UI. */
  async evaluateLatestFullTankPair(): Promise<void> {
    const pair = await fuelRepository.lastFullTankPair();
    if (!pair) return;
    const [second, first] = pair;

    const pairId = second.id || String(second.date);
    if (storage.getString(LAST_PAIR_KEY) === pairId) return;

    const trips = await tripRepository.trips({ start: first.date, end: second.date });
    const calculatedL = trips.reduce((s, t) => s + t.fuelUsedL, 0);
    const distanceKm = trips.reduce((s, t) => s + t.distanceKm, 0);
    const measuredL = second.liters;
    const raw = calculatedL > 0 ? measuredL / calculatedL : 0;
    const rejection = rejectionFor(calculatedL, distanceKm, raw);

    await insertSample({
      date: second.date,
      measuredL,
      calculatedL,
      distanceKm,
      rawFactor: raw,
      accepted: rejection == null,
    });
    storage.set(LAST_PAIR_KEY, pairId);
    if (rejection != null) return;

    const rows = await db.select().from(calibrationSamples);
    if (rows.filter((r) => r.accepted).length < FUEL_CAL_REQUIRED_SAMPLES) return;

    const settings = useAppSettings.getState();
    let factor = settings.fuelCalibrationFactor * (1 - 0.35) + raw * 0.35;
    factor = Math.min(Math.max(factor, 0.7), 1.4);
    settings.set("fuelCalibrationFactor", factor);
  },

  async reset(): Promise<void> {
    useAppSettings.getState().set("fuelCalibrationFactor", 1.0);
    storage.remove(LAST_PAIR_KEY);
    await db.delete(calibrationSamples);
  },
};
