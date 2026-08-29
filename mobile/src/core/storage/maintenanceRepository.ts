import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "./db";
import { accelRecords, crankRecords, maintenanceItems } from "./schema";
import { activeVehicleId, activeVehicle, activeVehicleAdoptsOrphans } from "../vehicle/useGarage";
import { displayedOdometerKm } from "../vehicle/vehicleRepository";
import { computeDue, compareByUrgency, type DueInfo } from "../maintenance/maintenanceSchedule";

export interface MaintenanceItem {
  id: string;
  titleKey: string;
  customTitle: string | null;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastDoneKm: number | null;
  lastDoneDate: number | null;
  lastCost: number | null;
  note: string | null;
  isEnabled: boolean;
}

export interface ScheduledMaintenanceItem extends MaintenanceItem {
  due: DueInfo;
}

function rowToItem(row: typeof maintenanceItems.$inferSelect): MaintenanceItem {
  return {
    id: row.id,
    titleKey: row.titleKey,
    customTitle: row.customTitle,
    intervalKm: row.intervalKm,
    intervalMonths: row.intervalMonths,
    lastDoneKm: row.lastDoneKm,
    lastDoneDate: row.lastDoneDate,
    lastCost: row.lastCost,
    note: row.note,
    isEnabled: row.isEnabled,
  };
}

/** BMW/general maintenance defaults, seeded on first run. */
const DEFAULT_TEMPLATES: Array<Pick<MaintenanceItem, "titleKey" | "intervalKm" | "intervalMonths">> = [
  { titleKey: "maintenance.oilChange", intervalKm: 10000, intervalMonths: 12 },
  { titleKey: "maintenance.brakeFluid", intervalKm: 30000, intervalMonths: 24 },
  { titleKey: "maintenance.airFilter", intervalKm: 20000, intervalMonths: 12 },
  { titleKey: "maintenance.sparkPlugs", intervalKm: 60000, intervalMonths: 48 },
  { titleKey: "maintenance.coolant", intervalKm: 60000, intervalMonths: 60 },
];

/** Templates offered when adding an item, beyond the ones seeded by default. */
export const MAINTENANCE_TEMPLATES: Array<Pick<MaintenanceItem, "titleKey" | "intervalKm" | "intervalMonths">> = [
  ...DEFAULT_TEMPLATES,
  { titleKey: "maintenance.oilFilter", intervalKm: 10000, intervalMonths: 12 },
  { titleKey: "maintenance.cabinFilter", intervalKm: 20000, intervalMonths: 12 },
  { titleKey: "maintenance.fuelFilter", intervalKm: 40000, intervalMonths: 24 },
  { titleKey: "maintenance.brakePads", intervalKm: 40000, intervalMonths: null },
  { titleKey: "maintenance.tyreRotation", intervalKm: 10000, intervalMonths: null },
  { titleKey: "maintenance.transmissionOil", intervalKm: 80000, intervalMonths: 72 },
  { titleKey: "maintenance.timingBelt", intervalKm: 120000, intervalMonths: 120 },
  { titleKey: "maintenance.inspection", intervalKm: null, intervalMonths: 12 },
];

function newId(): string {
  return `mnt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Items belong to a vehicle; rows written before the garage existed have no
 * owner and show against the placeholder until the user says whose they are. */
function ownedByActiveVehicle(extra?: SQL): SQL | undefined {
  const vehicleId = activeVehicleId();
  const owned = !vehicleId
    ? undefined
    : activeVehicleAdoptsOrphans()
      ? or(eq(maintenanceItems.vehicleId, vehicleId), isNull(maintenanceItems.vehicleId))
      : eq(maintenanceItems.vehicleId, vehicleId);
  if (owned && extra) return and(owned, extra);
  return extra ?? owned;
}

/** Reading the distance side of the schedule is measured against. */
export function currentOdometerKm(): number {
  const vehicle = activeVehicle();
  return vehicle ? displayedOdometerKm(vehicle) : 0;
}

export class MaintenanceRepository {
  async items(): Promise<MaintenanceItem[]> {
    const rows = await db.select().from(maintenanceItems).where(ownedByActiveVehicle());
    return rows.map(rowToItem);
  }

  /** Items with their due state attached, most urgent first. */
  async schedule(now = Date.now()): Promise<ScheduledMaintenanceItem[]> {
    const ctx = { odometerKm: currentOdometerKm(), now };
    const items = await this.items();
    return items
      .map((item) => ({ ...item, due: computeDue(item, ctx) }))
      .sort((a, b) => compareByUrgency(a.due, b.due));
  }

  async ensureDefaults(): Promise<void> {
    const existing = await this.items();
    if (existing.length > 0) return;
    for (const template of DEFAULT_TEMPLATES) {
      await this.add(template);
    }
  }

  async add(template: Pick<MaintenanceItem, "titleKey" | "intervalKm" | "intervalMonths"> & Partial<MaintenanceItem>): Promise<string> {
    const id = template.id ?? newId();
    await db.insert(maintenanceItems).values({
      id,
      vehicleId: activeVehicleId(),
      titleKey: template.titleKey,
      customTitle: template.customTitle ?? null,
      intervalKm: template.intervalKm,
      intervalMonths: template.intervalMonths,
      lastDoneKm: template.lastDoneKm ?? null,
      lastDoneDate: template.lastDoneDate ?? null,
      note: template.note ?? null,
      isEnabled: template.isEnabled ?? true,
    });
    return id;
  }

  async update(id: string, patch: Partial<MaintenanceItem>): Promise<void> {
    const { id: _ignored, ...rest } = patch;
    if (Object.keys(rest).length === 0) return;
    await db.update(maintenanceItems).set(rest).where(eq(maintenanceItems.id, id));
  }

  async remove(id: string): Promise<void> {
    await db.delete(maintenanceItems).where(eq(maintenanceItems.id, id));
  }

  /** Records a service. Defaults to the odometer reading now, which is what the
   * schedule counts the next interval from. */
  async markDone(id: string, odometerKm?: number, cost?: number, at = Date.now()): Promise<void> {
    await db
      .update(maintenanceItems)
      .set({ lastDoneKm: odometerKm ?? currentOdometerKm(), lastDoneDate: at, lastCost: cost ?? null })
      .where(eq(maintenanceItems.id, id));
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await db.update(maintenanceItems).set({ isEnabled: enabled }).where(eq(maintenanceItems.id, id));
  }

  async crankHistory(limit = 20) {
    return db.select().from(crankRecords).orderBy(crankRecords.date).limit(limit);
  }

  async accelHistory(limit = 20) {
    return db.select().from(accelRecords).orderBy(accelRecords.date).limit(limit);
  }
}

export const maintenanceRepository = new MaintenanceRepository();
