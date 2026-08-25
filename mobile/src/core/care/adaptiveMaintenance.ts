import { eq } from "drizzle-orm";
import { db } from "../storage/db";
import { maintenanceLedger } from "../storage/schema";
import { baselineLearner } from "./baselineLearner";
import { compositeBucket } from "./careTypes";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip } from "../storage/models";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

const REDLINE_RPM = 6500;
const COOLANT_ALARM_C = 112;
const OIL_WARM_C = 90;
const LEDGER_KEYS = ["oil", "oilFilter", "airFilter", "spark", "transmission"];

export function severityFactor(params: {
  oilReached80: boolean;
  distanceKm: number;
  highRevShare: number;
  idleShare: number;
  thermalStressMin: number;
  avgSpeedKmh: number;
}): number {
  let s = 1.0;
  if (!params.oilReached80) s += 0.55;
  if (params.distanceKm < 4) s += 0.55;
  else if (params.distanceKm < 8) s += 0.35;
  s += Math.min(params.highRevShare, 1) * 0.5;
  s += Math.min(params.idleShare, 1) * 0.3;
  s += Math.min(params.thermalStressMin * 0.04, 0.4);
  if (params.avgSpeedKmh < 25) s += 0.1;
  return Math.min(Math.max(s, 1.0), 2.6);
}

/** Remaining distance never exceeds the OEM interval (cannot extend it). */
export function remainingKm(intervalKm: number, effectiveKm: number, actualKm: number): number {
  return Math.min(intervalKm - effectiveKm, intervalKm - actualKm);
}

class AdaptiveMaintenance implements CareFeature {
  id = "adaptiveMaint";

  private highRevS = 0;
  private idleS = 0;
  private thermalStressMin = 0;
  private sawHotOil = false;
  private lastSampleAt: number | undefined;
  lastSeverity = 1.0;

  isEnabled(settings: { careAdaptiveIntervals: boolean }): boolean {
    return settings.careAdaptiveIntervals;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const now = context.now;
    const dt = this.lastSampleAt != null ? Math.min(2, (now - this.lastSampleAt) / 1000) : 1;
    this.lastSampleAt = now;

    const rpm = snapshot.rpm ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    if (rpm > REDLINE_RPM * 0.6) this.highRevS += dt;
    if (speed < 2 && rpm > 300) this.idleS += dt;
    if (snapshot.coolantC != null && snapshot.coolantC > COOLANT_ALARM_C - 3) this.thermalStressMin += dt / 60;
    if (context.oilTempC != null && context.oilTempC >= OIL_WARM_C) this.sawHotOil = true;

    const cues: CareCue[] = [];
    if (snapshot.mafGs != null && snapshot.engineLoadPct != null) {
      const bucket = compositeBucket(context.ambientC, snapshot.engineLoadPct, speed);
      baselineLearner.observe("maf.flow", snapshot.mafGs, bucket, 300, [0, 300], now).catch(() => undefined);
      const snap = baselineLearner.snapshot("maf.flow", bucket);
      if (snap?.isMature && snapshot.mafGs < snap.p50 * 0.9) {
        cues.push({ id: "airflow.low", text: "Airflow reading looks lower than usual — consider checking the air filter.", severity: "coach" });
      }
    }
    return cues;
  }

  async onTripEnded(trip: Trip): Promise<CareCue[]> {
    const severity = severityFactor({
      oilReached80: this.sawHotOil,
      distanceKm: trip.distanceKm,
      highRevShare: trip.durationS > 0 ? this.highRevS / trip.durationS : 0,
      idleShare: trip.durationS > 0 ? this.idleS / trip.durationS : 0,
      thermalStressMin: this.thermalStressMin,
      avgSpeedKmh: trip.avgSpeedKmh,
    });
    this.lastSeverity = severity;
    await this.applyLedger(trip.distanceKm, severity);
    this.resetTrip();
    return [];
  }

  private async applyLedger(distanceKm: number, severity: number): Promise<void> {
    for (const key of LEDGER_KEYS) {
      const rows = await db.select().from(maintenanceLedger).where(eq(maintenanceLedger.itemKey, key));
      const existing = rows[0];
      if (existing) {
        const actualKm = existing.actualKm + distanceKm;
        const effectiveKm = existing.effectiveKm + distanceKm * severity;
        const n = Math.max(1, actualKm / Math.max(distanceKm, 0.1));
        const severityAvg = (existing.severityAvg * (n - 1) + severity) / n;
        await db.update(maintenanceLedger).set({ actualKm, effectiveKm, severityAvg }).where(eq(maintenanceLedger.id, existing.id));
      } else {
        await db.insert(maintenanceLedger).values({ itemKey: key, actualKm: distanceKm, effectiveKm: distanceKm * severity, severityAvg: severity });
      }
    }
  }

  resetTrip(): void {
    this.highRevS = 0;
    this.idleS = 0;
    this.thermalStressMin = 0;
    this.sawHotOil = false;
    this.lastSampleAt = undefined;
  }
}

export const adaptiveMaintenance = new AdaptiveMaintenance();
