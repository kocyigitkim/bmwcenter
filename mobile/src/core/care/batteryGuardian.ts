import { db } from "../storage/db";
import { crankRecords, protectionEvents } from "../storage/schema";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

/** EFB reference rest-voltage bands — the unported per-vehicle battery-chemistry
 * profile would pick flooded/AGM/lithium bands; EFB is a reasonable universal default. */
const REST_FULL = 12.7;
const REST_WARN = 12.45;
const REST_DEEP = 12.2;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

class BatteryGuardian implements CareFeature {
  id = "batteryGuardian";

  private voltageSamples: Array<{ t: number; v: number }> = [];
  private previousRPM: number | undefined;
  private restingBuffer: number[] = [];
  private chargingLowStreakStart: number | undefined;
  private overchargeStreakStart: number | undefined;
  private chargingAnnounced = false;
  private crankAnnouncedAt = 0;

  isEnabled(settings: { careBatteryGuardian: boolean }): boolean {
    return settings.careBatteryGuardian;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const now = context.now;
    const rpm = snapshot.rpm ?? 0;
    const cues: CareCue[] = [];

    if (snapshot.voltage != null) {
      this.voltageSamples.push({ t: now, v: snapshot.voltage });
      this.voltageSamples = this.voltageSamples.filter((s) => now - s.t <= 30_000);
      if (rpm < 50) {
        this.restingBuffer.push(snapshot.voltage);
        if (this.restingBuffer.length > 20) this.restingBuffer.shift();
      }
    }

    // Simplified crank detection: RPM crosses from ~0 to running.
    if ((this.previousRPM ?? 0) < 50 && rpm >= 200 && now - this.crankAnnouncedAt > 5000) {
      this.crankAnnouncedAt = now;
      const window = this.voltageSamples.filter((s) => now - s.t <= 3000);
      const minVoltage = window.length ? Math.min(...window.map((s) => s.v)) : (snapshot.voltage ?? 12.6);
      const resting = this.restingBuffer.length
        ? this.restingBuffer.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, this.restingBuffer.length)
        : minVoltage;
      db.insert(crankRecords)
        .values({ date: now, minVoltage, restingVoltage: resting, recoveryVoltage: snapshot.voltage ?? resting, ambientC: context.ambientC ?? snapshot.ambientC })
        .catch(() => undefined);

      if (resting < REST_DEEP) {
        cues.push({ id: "battery.deep", text: "Battery resting voltage is low — consider a charge or health check.", severity: "protective" });
        db.insert(protectionEvents)
          .values({ id: `pe_${now}_${Math.random().toString(36).slice(2, 6)}`, type: "lowVoltage", severity: "alarm", t: now, value: resting, thresholdUsed: REST_DEEP })
          .catch(() => undefined);
      } else if (resting < REST_WARN) {
        cues.push({ id: "battery.warn", text: "Battery resting voltage is a bit low.", severity: "coach" });
      }
    }

    cues.push(...this.evaluateCharging(snapshot, context));
    this.previousRPM = rpm;
    return cues;
  }

  private evaluateCharging(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const now = context.now;
    const rpm = snapshot.rpm ?? 0;
    const cues: CareCue[] = [];

    const lowGateOK = rpm > 900 && (snapshot.voltage ?? 99) < 13.2;
    if (lowGateOK) {
      if (this.chargingLowStreakStart == null) this.chargingLowStreakStart = now;
      if (now - this.chargingLowStreakStart >= 60_000 && !this.chargingAnnounced) {
        this.chargingAnnounced = true;
        cues.push({ id: "battery.chargingLow", text: "Charging voltage is low while the engine is running.", severity: "protective" });
      }
    } else {
      this.chargingLowStreakStart = undefined;
      this.chargingAnnounced = false;
    }

    const ambient = context.ambientC ?? snapshot.ambientC ?? 25;
    const limit = 14.7 + clamp((25 - ambient) * 0.02, 0, 0.5);
    if (rpm > 900 && snapshot.voltage != null && snapshot.voltage > limit + 0.3) {
      if (this.overchargeStreakStart == null) this.overchargeStreakStart = now;
      if (now - this.overchargeStreakStart >= 60_000) {
        cues.push({ id: "battery.overcharge", text: "Charging voltage looks unusually high.", severity: "protective" });
      }
    } else {
      this.overchargeStreakStart = undefined;
    }

    return cues;
  }

  resetTrip(): void {
    this.voltageSamples = [];
    this.previousRPM = undefined;
    this.chargingLowStreakStart = undefined;
    this.overchargeStreakStart = undefined;
    this.chargingAnnounced = false;
  }
}

export const batteryGuardian = new BatteryGuardian();
