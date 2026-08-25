import { tripRepository, type DateInterval } from "../storage/tripRepository";
import { fuelRepository } from "../storage/fuelRepository";
import { emptyDrivingSummary, summarize, type DrivingSummary, type RefuelEntry } from "../storage/models";

export class FuelStatistics {
  async summary(range: DateInterval, pricePerLiter: number): Promise<DrivingSummary> {
    const trips = await tripRepository.trips(range);
    return trips.length ? summarize(trips, pricePerLiter) : emptyDrivingSummary();
  }

  async dailyFuel(lastDays = 14): Promise<Array<{ date: number; liters: number }>> {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    const start = new Date(end);
    start.setDate(start.getDate() - lastDays);
    const trips = await tripRepository.trips({ start: start.getTime(), end: end.getTime() });
    const buckets = new Map<number, number>();
    for (const trip of trips) {
      const d = new Date(trip.startedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      buckets.set(key, (buckets.get(key) ?? 0) + trip.fuelUsedL);
    }
    const result: Array<{ date: number; liters: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let offset = 0; offset < lastDays; offset++) {
      const day = new Date(today);
      day.setDate(day.getDate() - (lastDays - 1 - offset));
      result.push({ date: day.getTime(), liters: buckets.get(day.getTime()) ?? 0 });
    }
    return result;
  }

  async lastRefuel(): Promise<RefuelEntry | undefined> {
    const all = await fuelRepository.allRefuels();
    return all[0];
  }

  async measuredVsEstimated(): Promise<{ measured?: number; estimated?: number }> {
    const pair = await fuelRepository.lastFullTankPair();
    if (!pair) return {};
    const [latest, previous] = pair;
    if (latest.odometerKm == null || previous.odometerKm == null || !(latest.odometerKm > previous.odometerKm)) {
      return {};
    }
    const delta = latest.odometerKm - previous.odometerKm;
    const measured = (latest.liters / delta) * 100;
    const summary = await this.summary({ start: previous.date, end: latest.date }, 0);
    return { measured, estimated: summary.avgL100 > 0 ? summary.avgL100 : undefined };
  }
}

export const fuelStatistics = new FuelStatistics();
