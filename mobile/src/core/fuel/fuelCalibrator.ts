import { db } from "../storage/db";
import { calibrationSamples } from "../storage/schema";
import { fuelRepository } from "../storage/fuelRepository";
import { tripRepository } from "../storage/tripRepository";
import { useAppSettings } from "../settings/appSettings";

async function insertSample(
  measuredL: number,
  calculatedL: number,
  distanceKm: number,
  accepted: boolean,
  rawFactor?: number
) {
  const raw = rawFactor ?? (calculatedL > 0 ? measuredL / calculatedL : 0);
  await db.insert(calibrationSamples).values({
    date: Date.now(),
    measuredL,
    calculatedL,
    distanceKm,
    rawFactor: raw,
    accepted,
  });
}

export const fuelCalibrator = {
  async acceptedSampleCount(): Promise<number> {
    const rows = await db.select().from(calibrationSamples);
    return rows.filter((r) => r.accepted).length;
  },

  async evaluateLatestFullTankPair(): Promise<void> {
    const pair = await fuelRepository.lastFullTankPair();
    if (!pair) return;
    const [second, first] = pair;
    const trips = await tripRepository.trips({ start: first.date, end: second.date });
    const calculatedL = trips.reduce((s, t) => s + t.fuelUsedL, 0);
    const distanceKm = trips.reduce((s, t) => s + t.distanceKm, 0);
    const measuredL = second.liters;

    if (!(calculatedL > 15) || !(distanceKm > 150)) {
      await insertSample(measuredL, calculatedL, distanceKm, false);
      return;
    }
    const raw = measuredL / calculatedL;
    if (!(raw >= 0.6 && raw <= 1.6)) {
      await insertSample(measuredL, calculatedL, distanceKm, false, raw);
      return;
    }
    await insertSample(measuredL, calculatedL, distanceKm, true, raw);

    const rows = await db.select().from(calibrationSamples);
    const accepted = rows.filter((r) => r.accepted);
    if (accepted.length < 2) return;

    const settings = useAppSettings.getState();
    let factor = settings.fuelCalibrationFactor * (1 - 0.35) + raw * 0.35;
    factor = Math.min(Math.max(factor, 0.7), 1.4);
    settings.set("fuelCalibrationFactor", factor);
  },

  async reset(): Promise<void> {
    useAppSettings.getState().set("fuelCalibrationFactor", 1.0);
    await db.delete(calibrationSamples);
  },
};
