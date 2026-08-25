import { eq } from "drizzle-orm";
import { db } from "./db";
import { accelRecords, crankRecords, maintenanceItems } from "./schema";

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

/** BMW/general maintenance defaults (mirrors MaintenanceTemplates.swift's factory set). */
const DEFAULT_TEMPLATES: Array<Pick<MaintenanceItem, "id" | "titleKey" | "intervalKm" | "intervalMonths">> = [
  { id: "oil_change", titleKey: "maintenance.oilChange", intervalKm: 10000, intervalMonths: 12 },
  { id: "brake_fluid", titleKey: "maintenance.brakeFluid", intervalKm: 30000, intervalMonths: 24 },
  { id: "air_filter", titleKey: "maintenance.airFilter", intervalKm: 20000, intervalMonths: 12 },
  { id: "spark_plugs", titleKey: "maintenance.sparkPlugs", intervalKm: 60000, intervalMonths: 48 },
  { id: "coolant", titleKey: "maintenance.coolant", intervalKm: 60000, intervalMonths: 60 },
];

export class MaintenanceRepository {
  async items(): Promise<MaintenanceItem[]> {
    const rows = await db.select().from(maintenanceItems);
    return rows.map(rowToItem);
  }

  async ensureDefaults(): Promise<void> {
    const existing = await db.select().from(maintenanceItems);
    if (existing.length > 0) return;
    for (const template of DEFAULT_TEMPLATES) {
      await db.insert(maintenanceItems).values({
        id: template.id,
        titleKey: template.titleKey,
        intervalKm: template.intervalKm,
        intervalMonths: template.intervalMonths,
        isEnabled: true,
      });
    }
  }

  async markDone(id: string, odometerKm: number, cost?: number): Promise<void> {
    await db
      .update(maintenanceItems)
      .set({ lastDoneKm: odometerKm, lastDoneDate: Date.now(), lastCost: cost ?? null })
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
