import { db } from "../storage/db";
import { protectionEvents, thermalEvents } from "../storage/schema";
import { boostKpa, type VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

const REDLINE_RPM = 6500;
const MAX_BOOST_KPA = 150;
/** Fixed profile factor (water-cooled turbo, no aux electric pump) — the unported
 * per-vehicle profile system would tune this per powertrain. */
const PROFILE_FACTOR = 0.5;

function computeTLI(samples: Array<{ t: number; v: number }>): number {
  if (samples.length < 2) return samples[samples.length - 1]?.v ?? 0;
  let sum = 0;
  for (let i = 1; i < samples.length; i++) {
    const dt = (samples[i]!.t - samples[i - 1]!.t) / 1000;
    sum += samples[i]!.v * Math.max(dt, 0);
  }
  return sum / 300;
}

function recommendedIdleS(tli: number): number {
  if (tli < 0.25) return 0;
  if (tli < 0.45) return 20;
  if (tli < 0.7) return 45;
  if (tli < 1.0) return 75;
  return 120;
}

/** Simplified port of ThermalShockGuard.swift — detects turbo/engine "hot shutdown"
 * risk and recommends an idle-before-shutoff cooldown window. */
class ThermalShockGuard implements CareFeature {
  id = "thermalShock";

  countdownSeconds: number | undefined;

  private heatSamples: Array<{ t: number; v: number }> = [];
  private stopSince: number | undefined;
  private countdownActive = false;
  private countdownRemaining = 0;
  private idleAccumulated = 0;
  private announcedStart = false;
  private announcedDone = false;

  isEnabled(settings: { careThermalShock: string }): boolean {
    return settings.careThermalShock !== "off";
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const now = context.now;
    const rpm = snapshot.rpm ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    const load = snapshot.engineLoadPct ?? 0;
    const boost = boostKpa(snapshot) ?? 0;

    const boostFactor = Math.min(Math.max(1.0 + Math.max(boost, 0) / MAX_BOOST_KPA, 1.0), 2.2);
    let instant = (rpm / REDLINE_RPM) * (load / 100) * boostFactor;
    if (context.oilTempC != null && context.oilTempC > 105) instant *= 1.15;
    this.heatSamples.push({ t: now, v: instant });
    this.heatSamples = this.heatSamples.filter((s) => now - s.t <= 300_000);

    const tli = computeTLI(this.heatSamples);
    const wait = recommendedIdleS(tli) * PROFILE_FACTOR;

    const cues: CareCue[] = [];

    if (speed < 2 && rpm > 300) {
      if (this.stopSince == null) this.stopSince = now;
      const stoppedForMs = now - this.stopSince;
      if (wait > 0 && stoppedForMs >= 20_000) {
        if (!this.countdownActive) {
          this.countdownActive = true;
          this.countdownRemaining = wait;
          this.idleAccumulated = 0;
          this.announcedStart = false;
          this.announcedDone = false;
        }
        this.idleAccumulated += 1;
        this.countdownRemaining = Math.max(0, wait - this.idleAccumulated);
        this.countdownSeconds = this.countdownRemaining;

        if (!this.announcedStart) {
          this.announcedStart = true;
          cues.push({ id: "thermal.start", text: `Let the engine idle ~${Math.round(wait)}s before shutting off to protect the turbo.`, severity: "protective" });
        }
        if (this.countdownRemaining <= 0 && !this.announcedDone) {
          this.announcedDone = true;
          cues.push({ id: "thermal.done", text: "Safe to turn off now.", severity: "celebration" });
          db.insert(thermalEvents)
            .values({ t: now, tli, recommendedIdleS: wait, actualIdleS: this.idleAccumulated, compliant: true })
            .catch(() => undefined);
        }
      }
    } else if (speed >= 2) {
      this.stopSince = undefined;
      if (this.countdownActive && this.countdownRemaining > 0) {
        this.countdownActive = false;
        this.countdownSeconds = undefined;
      }
    }

    if (rpm < 50 && this.countdownActive && this.countdownRemaining > 0) {
      db.insert(thermalEvents)
        .values({ t: now, tli, recommendedIdleS: wait, actualIdleS: this.idleAccumulated, compliant: false })
        .catch(() => undefined);
      db.insert(protectionEvents)
        .values({ id: `pe_${now}_${Math.random().toString(36).slice(2, 6)}`, type: "hotShutdown", severity: "alarm", t: now, value: tli, thresholdUsed: wait })
        .catch(() => undefined);
      this.countdownActive = false;
      this.countdownSeconds = undefined;
    }

    return cues;
  }

  resetTrip(): void {
    this.heatSamples = [];
    this.stopSince = undefined;
    this.countdownActive = false;
    this.countdownRemaining = 0;
    this.countdownSeconds = undefined;
  }
}

export const thermalShockGuard = new ThermalShockGuard();
