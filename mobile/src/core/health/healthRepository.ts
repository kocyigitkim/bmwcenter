import { desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../storage/db";
import { crankRecords, dtcRecords, protectionEvents } from "../storage/schema";
import { storage } from "../settings/appSettings";
import type { EngineIgnition, MonitorStatus, ReadinessStatus } from "../obd/readiness";
import { activeVehicleId } from "../vehicle/useGarage";
import { computeHealth, type HealthInput, type HealthReport } from "./healthScore";

const READINESS_KEY = "health.lastReadiness";

export interface StoredReadiness {
  incompleteCount: number;
  supportedCount: number;
  milOn: boolean;
  at: number;
  /** Per-monitor detail, absent on installs that stored readiness before the
   * mechanic report needed the full table. */
  monitors?: MonitorStatus[];
  ignition?: EngineIgnition;
  dtcCount?: number;
}

/** The scan screen reads readiness live; health needs it later, so the last
 * result is kept. Also doubles as the "has a scan ever run" signal. */
export function rememberReadiness(r: ReadinessStatus): void {
  const payload: StoredReadiness = {
    incompleteCount: r.incompleteCount,
    supportedCount: r.monitors.filter((m) => m.supported).length,
    milOn: r.milOn,
    at: Date.now(),
    monitors: r.monitors,
    ignition: r.ignition,
    dtcCount: r.dtcCount,
  };
  try {
    storage.set(READINESS_KEY, JSON.stringify(payload));
  } catch {
    // Non-fatal: health simply reports lower confidence for emissions.
  }
}

export function lastReadiness(): StoredReadiness | undefined {
  try {
    const raw = storage.getString(READINESS_KEY);
    return raw ? (JSON.parse(raw) as StoredReadiness) : undefined;
  } catch {
    return undefined;
  }
}

export async function loadHealthReport(now = Date.now()): Promise<HealthReport> {
  const vehicleId = activeVehicleId();
  // Rows written before the garage existed have no owner; include them so an
  // upgraded install doesn't report an empty history.
  const owned = vehicleId
    ? or(eq(dtcRecords.vehicleId, vehicleId), isNull(dtcRecords.vehicleId))
    : undefined;

  const [codes, events, cranks] = await Promise.all([
    db.select().from(dtcRecords).where(owned),
    db.select().from(protectionEvents).orderBy(desc(protectionEvents.t)).limit(200),
    db.select().from(crankRecords).orderBy(desc(crankRecords.date)).limit(30),
  ]);

  const readiness = lastReadiness();
  const input: HealthInput = {
    now,
    // A cleared code is history, not a current fault.
    dtcs: codes
      .filter((c) => c.clearedAt == null)
      .map((c) => ({ code: c.code, status: c.status as "stored" | "pending" | "permanent" })),
    protectionEvents: events.map((e) => ({ type: e.type, severity: e.severity, t: e.t })),
    cranks: cranks.map((c) => ({ date: c.date, minVoltage: c.minVoltage })),
    readiness: readiness
      ? { incompleteCount: readiness.incompleteCount, supportedCount: readiness.supportedCount, milOn: readiness.milOn }
      : undefined,
    hasScanned: readiness != null || codes.length > 0,
  };
  return computeHealth(input);
}
