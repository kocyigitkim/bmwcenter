import { and, desc, eq, gte, isNull, lt, or, type SQL } from "drizzle-orm";
import { activeVehicleId, activeVehicleAdoptsOrphans } from "../vehicle/useGarage";
import { db } from "./db";
import { fuelPricePoints, refuelEntries } from "./schema";
import type { DateInterval } from "./tripRepository";
import type { FuelPricePoint, RefuelEntry } from "./models";

function rowToRefuel(row: typeof refuelEntries.$inferSelect): RefuelEntry {
  return {
    id: row.id,
    date: row.date,
    liters: row.liters,
    pricePerLiter: row.pricePerLiter,
    totalCost: row.totalCost,
    odometerKm: row.odometerKm,
    isFullTank: row.isFullTank,
    stationName: row.stationName,
    note: row.note,
  };
}

/** Restricts a query to the active vehicle; unscoped until the garage loads. */
function ownedByActiveVehicle(extra?: SQL): SQL | undefined {
  const id = activeVehicleId();
  if (!id) return extra;
  const owned = activeVehicleAdoptsOrphans()
    ? or(eq(refuelEntries.vehicleId, id), isNull(refuelEntries.vehicleId))!
    : eq(refuelEntries.vehicleId, id);
  return extra ? and(extra, owned) : owned;
}

export class FuelRepository {
  async refuels(range: DateInterval): Promise<RefuelEntry[]> {
    const rows = await db
      .select()
      .from(refuelEntries)
      .where(ownedByActiveVehicle(and(gte(refuelEntries.date, range.start), lt(refuelEntries.date, range.end))))
      .orderBy(desc(refuelEntries.date));
    return rows.map(rowToRefuel);
  }

  async allRefuels(): Promise<RefuelEntry[]> {
    const rows = await db
      .select()
      .from(refuelEntries)
      .where(ownedByActiveVehicle())
      .orderBy(desc(refuelEntries.date));
    return rows.map(rowToRefuel);
  }

  async lastFullTankPair(): Promise<[RefuelEntry, RefuelEntry] | undefined> {
    const rows = await db
      .select()
      .from(refuelEntries)
      .where(ownedByActiveVehicle(eq(refuelEntries.isFullTank, true)))
      .orderBy(desc(refuelEntries.date))
      .limit(2);
    if (rows.length < 2) return undefined;
    return [rowToRefuel(rows[0]!), rowToRefuel(rows[1]!)];
  }

  async priceHistory(days: number): Promise<FuelPricePoint[]> {
    const end = Date.now();
    const start = end - days * 86400_000;
    const rows = await db
      .select()
      .from(fuelPricePoints)
      .where(and(gte(fuelPricePoints.date, start), lt(fuelPricePoints.date, end)))
      .orderBy(fuelPricePoints.date);
    return rows.map((r) => ({ date: r.date, pricePerLiter: r.pricePerLiter, currencyCode: r.currencyCode }));
  }

  async addRefuel(entry: RefuelEntry, currencyCode = "TRY"): Promise<void> {
    await db.insert(refuelEntries).values({
      vehicleId: activeVehicleId(),
      id: entry.id,
      date: entry.date,
      liters: entry.liters,
      pricePerLiter: entry.pricePerLiter,
      totalCost: entry.totalCost,
      odometerKm: entry.odometerKm,
      isFullTank: entry.isFullTank,
      stationName: entry.stationName,
      note: entry.note,
    });
    await db.insert(fuelPricePoints).values({
      date: entry.date,
      pricePerLiter: entry.pricePerLiter,
      currencyCode,
    });
  }

  async deleteRefuel(id: string): Promise<void> {
    await db.delete(refuelEntries).where(eq(refuelEntries.id, id));
  }
}

export const fuelRepository = new FuelRepository();
