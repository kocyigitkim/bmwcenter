import { isEngineRunning } from "../obd/vehicleSnapshot";
import { db } from "../storage/db";
import { protectionEvents } from "../storage/schema";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

/** Simplified port of OverheatWatchdog.swift — uses fixed thresholds instead of the
 * per-vehicle-archetype `VehicleDiagnosticProfile` system (not ported; see plan notes). */
const HOT_RESTART_SOAK_MS = 20 * 60 * 1000;
const CONFIRM_MS = 3000;
const MAX_PLAUSIBLE_DELTA_C_PER_S = 3;

const WATCH_C = 106;
const ALARM_C = 112;
const CRITICAL_C = 118;
const THERMOSTAT_OPEN_C = 88;

class OverheatWatchdog implements CareFeature {
  id = "overheat";

  private coolantHistory: Array<{ t: number; c: number }> = [];
  private lastLevel: "watch" | "alarm" | "critical" | undefined;
  private fanAnnounced = false;
  private unstableAnnounced = false;
  private wasEngineRunning = false;
  private engineStartedAt: number | undefined;
  private engineStoppedAt: number | undefined;
  private lastAccepted: { t: number; c: number } | undefined;
  private criticalStreakStart: number | undefined;
  private alarmStreakStart: number | undefined;

  isEnabled(settings: { careOverheatWatchdog: boolean }): boolean {
    return settings.careOverheatWatchdog;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const rawCoolant = snapshot.coolantC;
    if (rawCoolant == null) return [];
    const now = context.now;

    const running = isEngineRunning(snapshot);
    if (running && !this.wasEngineRunning) this.engineStartedAt = now;
    else if (!running && this.wasEngineRunning) this.engineStoppedAt = now;
    this.wasEngineRunning = running;

    if (!running) {
      this.criticalStreakStart = undefined;
      this.alarmStreakStart = undefined;
      return [];
    }

    if (this.lastAccepted) {
      const dt = (now - this.lastAccepted.t) / 1000;
      if (dt > 0 && Math.abs(rawCoolant - this.lastAccepted.c) / dt > MAX_PLAUSIBLE_DELTA_C_PER_S) {
        return [];
      }
    }
    const coolant = rawCoolant;
    this.lastAccepted = { t: now, c: coolant };

    const sinceStart = this.engineStartedAt != null ? now - this.engineStartedAt : Infinity;
    const wasHotRestart = this.engineStoppedAt != null && now - this.engineStoppedAt < HOT_RESTART_SOAK_MS;
    const startupGraceMs = wasHotRestart ? 90_000 : 45_000;
    const inStartupGrace = sinceStart < startupGraceMs || coolant < THERMOSTAT_OPEN_C;

    const speed = snapshot.speedKmh ?? 0;

    this.coolantHistory.push({ t: now, c: coolant });
    this.coolantHistory = this.coolantHistory.filter((s) => now - s.t <= 600_000);

    const cues: CareCue[] = [];
    const isWarmedUp = coolant >= THERMOSTAT_OPEN_C;

    const last30 = this.coolantHistory.filter((s) => now - s.t <= 30_000);
    if (!inStartupGrace && coolant >= THERMOSTAT_OPEN_C + 5 && last30[0] && coolant - last30[0].c >= 8) {
      cues.push(this.alarmCue());
      this.log("alarm", coolant, ALARM_C);
      this.lastLevel = "alarm";
      return cues;
    }

    const fanDelayMs = 90_000;
    const fanTemp = 98;
    const lastFan = this.coolantHistory.filter((s) => now - s.t <= fanDelayMs);
    if (speed < 5 && isWarmedUp && coolant >= fanTemp && lastFan[0] && coolant - lastFan[0].c >= 5 && !this.fanAnnounced) {
      this.fanAnnounced = true;
      cues.push({ id: "overheat.fan", text: "Cooling fan may not be engaging — keep an eye on temperature at idle.", severity: "protective" });
    }

    if (speed > 40 && !this.unstableAnnounced) {
      const window = this.coolantHistory.filter((s) => now - s.t <= 600_000);
      if (oscillationCount(window, 8) >= 3) {
        this.unstableAnnounced = true;
        cues.push({ id: "overheat.unstable", text: "Coolant temperature is oscillating — possible thermostat issue.", severity: "protective" });
      }
    }

    if (inStartupGrace) {
      this.criticalStreakStart = undefined;
      this.alarmStreakStart = undefined;
    } else if (coolant >= CRITICAL_C) {
      this.alarmStreakStart = undefined;
      if (this.criticalStreakStart == null) this.criticalStreakStart = now;
      if (now - this.criticalStreakStart >= CONFIRM_MS) {
        if (this.lastLevel !== "critical") {
          cues.push({ id: "overheat.critical", text: "Engine overheating — pull over and let it cool.", severity: "critical" });
          this.log("critical", coolant, CRITICAL_C);
        }
        this.lastLevel = "critical";
      }
    } else if (coolant >= ALARM_C) {
      this.criticalStreakStart = undefined;
      if (this.alarmStreakStart == null) this.alarmStreakStart = now;
      if (now - this.alarmStreakStart >= CONFIRM_MS) {
        if (this.lastLevel !== "alarm" && this.lastLevel !== "critical") {
          cues.push(this.alarmCue());
          this.log("alarm", coolant, ALARM_C);
        }
        this.lastLevel = "alarm";
      }
    } else if (coolant >= WATCH_C) {
      this.criticalStreakStart = undefined;
      this.alarmStreakStart = undefined;
      this.lastLevel = "watch";
    } else {
      this.criticalStreakStart = undefined;
      this.alarmStreakStart = undefined;
      this.lastLevel = undefined;
    }

    return cues;
  }

  resetTrip(): void {
    this.fanAnnounced = false;
    this.unstableAnnounced = false;
    this.lastLevel = undefined;
    this.wasEngineRunning = false;
    this.engineStartedAt = undefined;
    this.lastAccepted = undefined;
    this.criticalStreakStart = undefined;
    this.alarmStreakStart = undefined;
  }

  private alarmCue(): CareCue {
    return { id: "overheat.alarm", text: "Coolant temperature is high — ease off and watch the gauge.", severity: "protective" };
  }

  private log(severity: string, value: number, threshold: number) {
    db.insert(protectionEvents)
      .values({ id: `pe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type: "overheat", severity, t: Date.now(), value, thresholdUsed: threshold })
      .catch(() => undefined);
  }
}

function oscillationCount(samples: Array<{ t: number; c: number }>, amplitude: number): number {
  if (samples.length < 4) return 0;
  let peaks = 0;
  let lastDir = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i]!.c - samples[i - 1]!.c;
    const dir = d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir && Math.abs(d) >= amplitude / 4) peaks++;
    if (dir !== 0) lastDir = dir;
  }
  const vals = samples.map((s) => s.c);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  if (mx - mn < amplitude) return 0;
  return Math.max(Math.floor(peaks / 2), mx - mn >= amplitude * 2 ? 3 : 1);
}

export const overheatWatchdog = new OverheatWatchdog();
