import { and, asc, desc, eq, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { activeVehicleId, activeVehicleAdoptsOrphans } from "../vehicle/useGarage";
import { db } from "./db";
import { drivingEvents, protectionEvents, tripDiagnosticEvents, trips, tripSamples } from "./schema";
import type { ProtectionEntry, TripDiagnosticEvent } from "../trip/tripDiagnostics";
import type { FreezeFrameValues } from "../obd/freezeFrame";
import {
  emptyDrivingSummary,
  summarize,
  type DrivingSummary,
  type Trip,
  type TripCategory,
} from "./models";

export interface DateInterval {
  start: number;
  end: number;
}

function rowToTrip(row: typeof trips.$inferSelect, events: (typeof drivingEvents.$inferSelect)[]): Trip {
  return {
    id: row.id,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    distanceKm: row.distanceKm,
    durationS: row.durationS,
    movingDurationS: row.movingDurationS,
    idleDurationS: row.idleDurationS,
    fuelUsedL: row.fuelUsedL,
    idleFuelL: row.idleFuelL,
    avgSpeedKmh: row.avgSpeedKmh,
    maxSpeedKmh: row.maxSpeedKmh,
    maxRpm: row.maxRpm,
    avgL100: row.avgL100,
    startFuelPct: row.startFuelPct,
    endFuelPct: row.endFuelPct,
    startLatitude: row.startLatitude,
    startLongitude: row.startLongitude,
    endLatitude: row.endLatitude,
    endLongitude: row.endLongitude,
    startPlaceName: row.startPlaceName,
    endPlaceName: row.endPlaceName,
    routeData: row.routeData ?? null,
    isManual: row.isManual,
    category: row.category as TripCategory,
    dataSource: row.dataSource,
    scoreTotal: row.scoreTotal,
    scoreBreakdownJSON: row.scoreBreakdownJSON,
    note: row.note,
    events: events
      .filter((e) => e.tripId === row.id)
      .map((e) => ({
        type: e.type,
        t: e.t,
        severity: e.severity,
        speedKmh: e.speedKmh,
        magnitude: e.magnitude,
        latitude: e.latitude ?? undefined,
        longitude: e.longitude ?? undefined,
      })),
  };
}

/** Restricts a query to the active vehicle. Returns the caller's condition
 * unchanged before the garage has loaded, so early reads still work. */
function ownedByActiveVehicle(extra?: SQL): SQL | undefined {
  const id = activeVehicleId();
  if (!id) return extra;
  const owned = activeVehicleAdoptsOrphans()
    ? or(eq(trips.vehicleId, id), isNull(trips.vehicleId))!
    : eq(trips.vehicleId, id);
  return extra ? and(extra, owned) : owned;
}

export class TripRepository {
  async trips(range: DateInterval): Promise<Trip[]> {
    const rows = await db
      .select()
      .from(trips)
      .where(ownedByActiveVehicle(and(gte(trips.startedAt, range.start), lt(trips.startedAt, range.end))))
      .orderBy(desc(trips.startedAt));
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const events = await db.select().from(drivingEvents);
    const relevant = events.filter((e) => e.tripId != null && ids.includes(e.tripId));
    return rows.map((r) => rowToTrip(r, relevant));
  }

  async todayTrips(): Promise<Trip[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return this.trips({ start: start.getTime(), end: start.getTime() + 86400_000 });
  }

  async weekTrips(): Promise<Trip[]> {
    const end = Date.now();
    return this.trips({ start: end - 7 * 86400_000, end });
  }

  async monthTrips(): Promise<Trip[]> {
    const end = Date.now();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 1);
    return this.trips({ start: start.getTime(), end });
  }

  async summary(range: DateInterval, pricePerLiter: number): Promise<DrivingSummary> {
    const list = await this.trips(range);
    return list.length ? summarize(list, pricePerLiter) : emptyDrivingSummary();
  }

  async recentTrips(limit: number): Promise<Trip[]> {
    const rows = await db
      .select()
      .from(trips)
      .where(ownedByActiveVehicle())
      .orderBy(desc(trips.startedAt))
      .limit(limit);
    if (!rows.length) return [];
    const events = await db.select().from(drivingEvents);
    return rows.map((r) => rowToTrip(r, events));
  }

  async scoreTrend(days: number): Promise<Array<{ date: number; avgScore: number }>> {
    const end = Date.now();
    const start = end - days * 86400_000;
    const rows = await this.trips({ start, end });
    const buckets = new Map<number, number[]>();
    for (const trip of rows) {
      if (trip.scoreTotal == null) continue;
      const d = new Date(trip.startedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const list = buckets.get(key) ?? [];
      list.push(trip.scoreTotal);
      buckets.set(key, list);
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([date, values]) => ({ date, avgScore: values.reduce((a, b) => a + b, 0) / values.length }));
  }

  async trip(id: string): Promise<Trip | undefined> {
    const row = await db.select().from(trips).where(eq(trips.id, id)).get();
    if (!row) return undefined;
    const events = await db.select().from(drivingEvents).where(eq(drivingEvents.tripId, id));
    return rowToTrip(row, events);
  }

  /** Recorded telemetry for one trip, oldest first — the input to tripAnalysis. */
  async samples(tripId: string) {
    return db.select().from(tripSamples).where(eq(tripSamples.tripId, tripId)).orderBy(asc(tripSamples.t));
  }

  /**
   * What the car reported about itself during the trip: codes that set, MIL
   * changes, and the protection warnings the care watchdogs raised.
   */
  async diagnostics(tripId: string): Promise<{
    events: TripDiagnosticEvent[];
    protection: ProtectionEntry[];
  }> {
    const [rows, warnings] = await Promise.all([
      db
        .select()
        .from(tripDiagnosticEvents)
        .where(eq(tripDiagnosticEvents.tripId, tripId))
        .orderBy(asc(tripDiagnosticEvents.t)),
      db
        .select()
        .from(protectionEvents)
        .where(eq(protectionEvents.tripId, tripId))
        .orderBy(asc(protectionEvents.t)),
    ]);
    return {
      events: rows.map((row) => ({
        t: row.t,
        kind: row.kind as TripDiagnosticEvent["kind"],
        code: row.code ?? undefined,
        status: row.status ?? undefined,
        freezeFrame: parseJSON<FreezeFrameValues>(row.freezeFrameJSON),
        context: parseJSON<Record<string, number>>(row.contextJSON),
      })),
      protection: warnings.map((row) => ({ t: row.t, type: row.type, severity: row.severity })),
    };
  }

  async deleteTrip(id: string): Promise<void> {
    await db.delete(drivingEvents).where(eq(drivingEvents.tripId, id));
    await db.delete(tripSamples).where(eq(tripSamples.tripId, id));
    await db.delete(tripDiagnosticEvents).where(eq(tripDiagnosticEvents.tripId, id));
    await db.delete(trips).where(eq(trips.id, id));
  }

  async setCategory(id: string, category: TripCategory): Promise<void> {
    await db.update(trips).set({ category }).where(eq(trips.id, id));
  }

  async insert(trip: Trip): Promise<void> {
    await db.insert(trips).values({
      vehicleId: activeVehicleId(),
      id: trip.id,
      startedAt: trip.startedAt,
      endedAt: trip.endedAt,
      distanceKm: trip.distanceKm,
      durationS: trip.durationS,
      movingDurationS: trip.movingDurationS,
      idleDurationS: trip.idleDurationS,
      fuelUsedL: trip.fuelUsedL,
      idleFuelL: trip.idleFuelL,
      avgSpeedKmh: trip.avgSpeedKmh,
      maxSpeedKmh: trip.maxSpeedKmh,
      maxRpm: trip.maxRpm,
      avgL100: trip.avgL100,
      startFuelPct: trip.startFuelPct,
      endFuelPct: trip.endFuelPct,
      startLatitude: trip.startLatitude,
      startLongitude: trip.startLongitude,
      endLatitude: trip.endLatitude,
      endLongitude: trip.endLongitude,
      startPlaceName: trip.startPlaceName,
      endPlaceName: trip.endPlaceName,
      routeData: trip.routeData ?? undefined,
      isManual: trip.isManual,
      category: trip.category,
      dataSource: trip.dataSource,
      scoreTotal: trip.scoreTotal,
      scoreBreakdownJSON: trip.scoreBreakdownJSON,
      note: trip.note,
    });
  }

  async update(trip: Trip): Promise<void> {
    await db
      .update(trips)
      .set({
        endedAt: trip.endedAt,
        distanceKm: trip.distanceKm,
        durationS: trip.durationS,
        movingDurationS: trip.movingDurationS,
        idleDurationS: trip.idleDurationS,
        fuelUsedL: trip.fuelUsedL,
        idleFuelL: trip.idleFuelL,
        avgSpeedKmh: trip.avgSpeedKmh,
        maxSpeedKmh: trip.maxSpeedKmh,
        maxRpm: trip.maxRpm,
        avgL100: trip.avgL100,
        endFuelPct: trip.endFuelPct,
        endLatitude: trip.endLatitude,
        endLongitude: trip.endLongitude,
        endPlaceName: trip.endPlaceName,
        routeData: trip.routeData ?? undefined,
        scoreTotal: trip.scoreTotal,
        scoreBreakdownJSON: trip.scoreBreakdownJSON,
        note: trip.note,
      })
      .where(eq(trips.id, trip.id));
  }

  async deleteAll(): Promise<void> {
    await db.delete(drivingEvents);
    await db.delete(trips);
  }
}

export const tripRepository = new TripRepository();

function parseJSON<T>(raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}
