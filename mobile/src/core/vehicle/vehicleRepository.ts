import { eq, isNull, sql } from "drizzle-orm";
import { db } from "../storage/db";
import { dtcRecords, maintenanceItems, refuelEntries, trips, vehicleProfiles } from "../storage/schema";
import { useAppSettings, type FuelType } from "../settings/appSettings";

export interface GarageVehicle {
  id: string;
  name: string;
  fuelType: FuelType;
  tankCapacityL: number;
  displacementL: number;
  volumetricEfficiency: number;
  isTurbo: boolean;
  fuelCalibrationFactor: number;
  speedCalibrationFactor: number;
  odometerKm: number;
  odometerOffsetKm: number;
  vin: string | null;
  isActive: boolean;
}

type Row = typeof vehicleProfiles.$inferSelect;

function toVehicle(row: Row): GarageVehicle {
  return {
    id: row.id,
    name: row.name,
    fuelType: row.fuelType as FuelType,
    tankCapacityL: row.tankCapacityL,
    displacementL: row.displacementL,
    volumetricEfficiency: row.volumetricEfficiency,
    isTurbo: row.isTurbo,
    fuelCalibrationFactor: row.fuelCalibrationFactor,
    speedCalibrationFactor: row.speedCalibrationFactor,
    odometerKm: row.odometerKm,
    odometerOffsetKm: row.odometerOffsetKm,
    vin: row.vin,
    isActive: row.isActive,
  };
}

function newId(): string {
  return `veh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const vehicleRepository = {
  async all(): Promise<GarageVehicle[]> {
    const rows = await db.select().from(vehicleProfiles);
    return rows.map(toVehicle);
  },

  async active(): Promise<GarageVehicle | undefined> {
    const rows = await db.select().from(vehicleProfiles).where(eq(vehicleProfiles.isActive, true));
    return rows[0] ? toVehicle(rows[0]) : undefined;
  },

  /**
   * Creates the first vehicle from the settings the app has been using so far,
   * and adopts every record written before multi-vehicle support existed.
   *
   * Without the backfill, upgrading would hide all past trips, refuels and codes
   * behind a vehicle filter that never matches them.
   */
  async ensureDefault(): Promise<GarageVehicle> {
    const existing = await this.all();
    if (existing.length > 0) {
      return existing.find((v) => v.isActive) ?? existing[0]!;
    }

    const s = useAppSettings.getState();
    const vehicle: GarageVehicle = {
      id: newId(),
      name: s.vehicleName || [s.vehicleMake, s.vehicleModel].filter(Boolean).join(" ") || "Vehicle",
      fuelType: s.fuelType,
      tankCapacityL: s.tankCapacityL,
      displacementL: s.displacementL,
      volumetricEfficiency: s.volumetricEfficiency,
      isTurbo: s.isTurbo,
      fuelCalibrationFactor: s.fuelCalibrationFactor,
      speedCalibrationFactor: s.speedCalibrationFactor,
      odometerKm: 0,
      odometerOffsetKm: 0,
      vin: s.lastVIN || null,
      isActive: true,
    };
    await db.insert(vehicleProfiles).values(vehicle);

    for (const table of [trips, refuelEntries, dtcRecords, maintenanceItems]) {
      await db
        .update(table)
        .set({ vehicleId: vehicle.id })
        .where(isNull(table.vehicleId))
        .catch(() => undefined);
    }
    return vehicle;
  },

  async create(partial: Partial<GarageVehicle> & { name: string }): Promise<GarageVehicle> {
    const vehicle: GarageVehicle = {
      id: newId(),
      fuelType: "gasoline",
      tankCapacityL: 60,
      displacementL: 2.0,
      volumetricEfficiency: 0.85,
      isTurbo: true,
      fuelCalibrationFactor: 1.0,
      speedCalibrationFactor: 1.0,
      odometerKm: 0,
      odometerOffsetKm: 0,
      vin: null,
      isActive: false,
      ...partial,
    };
    await db.insert(vehicleProfiles).values(vehicle);
    return vehicle;
  },

  async update(id: string, patch: Partial<GarageVehicle>): Promise<void> {
    const { id: _ignored, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    await db.update(vehicleProfiles).set(rest).where(eq(vehicleProfiles.id, id));
  },

  /** Exactly one vehicle is active at a time. */
  async setActive(id: string): Promise<void> {
    await db.update(vehicleProfiles).set({ isActive: false });
    await db.update(vehicleProfiles).set({ isActive: true }).where(eq(vehicleProfiles.id, id));
  },

  /** Refuses to delete the last vehicle — the app has no meaningful state without one. */
  async remove(id: string): Promise<boolean> {
    const all = await this.all();
    if (all.length <= 1) return false;
    const wasActive = all.find((v) => v.id === id)?.isActive ?? false;
    await db.delete(vehicleProfiles).where(eq(vehicleProfiles.id, id));
    if (wasActive) {
      const next = (await this.all())[0];
      if (next) await this.setActive(next.id);
    }
    return true;
  },

  /** Odometer advances with recorded distance; the offset carries the reading the
   * user entered so the displayed value matches the dashboard in the car. */
  async addDistance(id: string, km: number): Promise<void> {
    if (!(km > 0)) return;
    await db
      .update(vehicleProfiles)
      .set({ odometerKm: sql`${vehicleProfiles.odometerKm} + ${km}` })
      .where(eq(vehicleProfiles.id, id));
  },
};

/** Reading shown to the user: distance we recorded plus the manual baseline. */
export function displayedOdometerKm(vehicle: Pick<GarageVehicle, "odometerKm" | "odometerOffsetKm">): number {
  return vehicle.odometerKm + vehicle.odometerOffsetKm;
}
