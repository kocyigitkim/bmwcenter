import { db } from "../storage/db";
import { protectionEvents } from "../storage/schema";
import { boostKpa, type VehicleSnapshot } from "../obd/vehicleSnapshot";
import { estimateOilTempC } from "./oilTempEstimator";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

const REDLINE_RPM = 6500;

function caps(oilTempC: number): { rpm?: number; load?: number } {
  let pct: [number, number] | undefined;
  if (oilTempC < 20) pct = [0.35, 45];
  else if (oilTempC < 40) pct = [0.42, 55];
  else if (oilTempC < 60) pct = [0.52, 65];
  else if (oilTempC < 80) pct = [0.64, 80];
  else return {};
  return { rpm: REDLINE_RPM * pct[0], load: pct[1] };
}

/** Warns about revving a cold engine — fixed redline/oil-warmup assumptions
 * instead of the unported per-vehicle-archetype profile system. */
class ColdEngineShield implements CareFeature {
  id = "coldShield";

  private violationStreakStart: number | undefined;
  private tripViolations = 0;
  private idleSince: number | undefined;
  private readyAnnounced = false;
  private longIdleAnnounced = false;

  get coldViolationsThisTrip(): number {
    return this.tripViolations;
  }

  isEnabled(settings: { careColdShield: boolean }): boolean {
    return settings.careColdShield;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const cues: CareCue[] = [];
    const now = context.now;
    const ambient = context.ambientC ?? snapshot.ambientC ?? 15;
    const oil = estimateOilTempC(context.oilTempC, snapshot.coolantC, ambient, snapshot.runtimeS ?? 0);
    const rpm = snapshot.rpm ?? 0;
    const normLoad = snapshot.engineLoadPct ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    const boost = boostKpa(snapshot) ?? 0;

    context.isColdPhase = oil < 90;

    const catalystWarmup = (snapshot.runtimeS ?? 999) < 90 && (snapshot.coolantC ?? 99) < 40 && speed < 2;

    if (speed < 2 && rpm > 300) {
      if (this.idleSince == null) this.idleSince = now;
    } else {
      this.idleSince = undefined;
    }

    if (this.idleSince != null) {
      const idleMs = now - this.idleSince;
      const wasteThresholdMs = (ambient < 0 ? 360 : ambient < 10 ? 240 : 180) * 1000;
      if (idleMs >= 40_000 && !this.readyAnnounced && oil < 60) {
        this.readyAnnounced = true;
        cues.push({ id: "cold.ready", text: "Engine is warm enough to drive off.", severity: "celebration" });
      }
      if (idleMs > wasteThresholdMs && !this.longIdleAnnounced) {
        this.longIdleAnnounced = true;
        cues.push({ id: "cold.longIdle", text: "No need to idle this long — driving gently warms the engine faster.", severity: "coach" });
      }
    }

    if (catalystWarmup) {
      this.violationStreakStart = undefined;
      return cues;
    }

    const { rpm: rpmCap, load: loadCap } = caps(oil);
    if (rpmCap == null || loadCap == null) {
      this.violationStreakStart = undefined;
      return cues;
    }

    let violating = rpm > rpmCap || normLoad > loadCap;
    let severeMargin = false;
    if (rpm > rpmCap) severeMargin = severeMargin || (rpm - rpmCap) / rpmCap > 0.25;
    if (normLoad > loadCap) severeMargin = severeMargin || normLoad - loadCap > 25;
    if (oil < 60 && boost > 50) violating = true;

    if (violating) {
      if (this.violationStreakStart == null) this.violationStreakStart = now;
      if (now - this.violationStreakStart >= 1500) {
        this.violationStreakStart = now + 10_000;
        this.tripViolations += 1;
        this.log(rpm, rpmCap);
        if (this.tripViolations <= 2) {
          if (this.tripViolations === 1 && !severeMargin) {
            cues.push({ id: "cold.v1", text: "Take it easy — engine is still warming up.", severity: "coach" });
          } else {
            cues.push({ id: "cold.v2", text: "Still cold — avoid high RPM and hard acceleration.", severity: "protective" });
          }
        }
      }
    } else {
      this.violationStreakStart = undefined;
    }

    return cues;
  }

  resetTrip(): void {
    this.tripViolations = 0;
    this.violationStreakStart = undefined;
    this.idleSince = undefined;
    this.readyAnnounced = false;
    this.longIdleAnnounced = false;
  }

  private log(value: number, threshold: number) {
    db.insert(protectionEvents)
      .values({ id: `pe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: "coldRev", severity: "alarm", t: Date.now(), value, thresholdUsed: threshold })
      .catch(() => undefined);
  }
}

export const coldEngineShield = new ColdEngineShield();
