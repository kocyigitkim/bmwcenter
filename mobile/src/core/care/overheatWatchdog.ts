import { isEngineRunning } from "../obd/vehicleSnapshot";
import { db } from "../storage/db";
import { protectionEvents } from "../storage/schema";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import {
  coolantAlarmC,
  coolantCriticalC,
  coolantWatchC,
  effectiveFanOnC,
  warmupTargetC,
} from "../vehicle/vehicleProfile";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

/** Coolant overheat watchdog. Thresholds come from the resolved
 * `VehicleDiagnosticProfile`, so an 82 °C-thermostat diesel alarms far earlier than a
 * 95 °C map-controlled turbo instead of every car sharing one fixed number. */
const HOT_RESTART_SOAK_MS = 20 * 60 * 1000;
const CONFIRM_MS = 3000;
const MAX_PLAUSIBLE_DELTA_C_PER_S = 3;

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

    // "Operating temperature +5%" in the user's terms: the alarm sits a fixed margin over
    // this engine's normal ceiling, which itself is derived from its thermostat rating.
    // `sensitivityOffsetC` lets the Care sensitivity setting shift all of them together.
    const offset = context.sensitivityOffsetC;
    const profile = context.vehicle;
    const thermostatOpenC = warmupTargetC(profile) + 3;
    const watchC = coolantWatchC(profile) + offset;
    const alarmC = coolantAlarmC(profile) + offset;
    const criticalC = coolantCriticalC(profile) + offset;
    const fanTemp = effectiveFanOnC(profile);

    const sinceStart = this.engineStartedAt != null ? now - this.engineStartedAt : Infinity;
    const wasHotRestart = this.engineStoppedAt != null && now - this.engineStoppedAt < HOT_RESTART_SOAK_MS;
    const startupGraceMs = wasHotRestart ? 90_000 : 45_000;
    const inStartupGrace = sinceStart < startupGraceMs || coolant < thermostatOpenC;

    const speed = snapshot.speedKmh ?? 0;

    this.coolantHistory.push({ t: now, c: coolant });
    this.coolantHistory = this.coolantHistory.filter((s) => now - s.t <= 600_000);

    const cues: CareCue[] = [];
    const isWarmedUp = coolant >= thermostatOpenC;

    const last30 = this.coolantHistory.filter((s) => now - s.t <= 30_000);
    if (!inStartupGrace && coolant >= thermostatOpenC + 5 && last30[0] && coolant - last30[0].c >= 8) {
      cues.push(this.alarmCue());
      this.log("alarm", coolant, alarmC);
      this.lastLevel = "alarm";
      return cues;
    }

    const fanDelayMs = 90_000;
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
    } else if (coolant >= criticalC) {
      this.alarmStreakStart = undefined;
      if (this.criticalStreakStart == null) this.criticalStreakStart = now;
      if (now - this.criticalStreakStart >= CONFIRM_MS) {
        if (this.lastLevel !== "critical") {
          cues.push({ id: "overheat.critical", text: "Engine overheating — pull over and let it cool.", severity: "critical" });
          this.log("critical", coolant, criticalC);
        }
        this.lastLevel = "critical";
      }
    } else if (coolant >= alarmC) {
      this.criticalStreakStart = undefined;
      if (this.alarmStreakStart == null) this.alarmStreakStart = now;
      if (now - this.alarmStreakStart >= CONFIRM_MS) {
        if (this.lastLevel !== "alarm" && this.lastLevel !== "critical") {
          cues.push(this.alarmCue());
          this.log("alarm", coolant, alarmC);
        }
        this.lastLevel = "alarm";
      }
    } else if (coolant >= watchC) {
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

/** Counts genuine direction reversals of at least `amplitude`. A monotonic climb is not
 * oscillation however far it travels — deriving a count from the sample range alone made
 * every ordinary cold-start warmup report a bouncing thermostat. */
function oscillationCount(samples: Array<{ t: number; c: number }>, amplitude: number): number {
  if (samples.length < 4) return 0;
  const vals = samples.map((s) => s.c);
  if (Math.max(...vals) - Math.min(...vals) < amplitude) return 0;

  // Zigzag: follow the current leg's extreme and count a turn only once the temperature
  // has retraced from it by the full amplitude. The first leg establishes direction and
  // is not itself a reversal.
  let reversals = 0;
  let dir: -1 | 0 | 1 = 0;
  let high = vals[0]!;
  let low = vals[0]!;

  for (const value of vals) {
    if (value > high) high = value;
    if (value < low) low = value;

    if (dir >= 0 && high - value >= amplitude) {
      if (dir > 0) reversals++;
      dir = -1;
      low = value;
      high = value;
    } else if (dir <= 0 && value - low >= amplitude) {
      if (dir < 0) reversals++;
      dir = 1;
      high = value;
      low = value;
    }
  }
  return reversals;
}

export const overheatWatchdog = new OverheatWatchdog();
