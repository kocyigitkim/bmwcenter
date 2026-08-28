import { db } from "../storage/db";
import { protectionEvents } from "../storage/schema";
import { baselineLearner } from "./baselineLearner";
import { bucketAmbient } from "./careTypes";
import { isEngineRunning, type VehicleSnapshot } from "../obd/vehicleSnapshot";
import { warmupTargetC } from "../vehicle/vehicleProfile";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

/** Distance a car must actually cover before "still not warm" means anything — a long
 * stationary idle warms slowly on any healthy engine, so time alone is not evidence. */
const SLOW_WARMUP_MIN_DISTANCE_KM = 5;
const SLOW_WARMUP_MIN_MOVING_MS = 8 * 60 * 1000;

/** Port of ThermostatWatch.swift — detects slow warmup (stuck-open thermostat), highway
 * over-cooling, and post-warmup spikes (stuck-closed). Targets come from the resolved
 * vehicle profile, so a 95 °C map-controlled engine is not judged against an 82 °C
 * diesel's warmup curve. */
class ThermostatWatch implements CareFeature {
  id = "thermostat";

  private warmupStart: number | undefined;
  private warmupWork = 0;
  private lastSampleAt: number | undefined;
  private warmupDone = false;
  private consecutiveSlow = 0;
  private highwayCoolSince: number | undefined;
  private lastCoolant: number | undefined;
  private spikeWatchStart: number | undefined;
  private plateauSamples: Array<{ t: number; c: number }> = [];
  private movingMs = 0;
  private movingDistanceKm = 0;
  private slowWarmupAnnounced = false;

  isEnabled(settings: { careThermostatWatch: boolean }): boolean {
    return settings.careThermostatWatch;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    if (snapshot.coolantC == null) return [];
    const coolant = snapshot.coolantC;
    const now = context.now;
    const speed = snapshot.speedKmh ?? 0;
    const normLoad = snapshot.engineLoadPct ?? 0;
    const rpm = snapshot.rpm ?? 0;
    const ambient = context.ambientC ?? snapshot.ambientC ?? 15;
    const profile = context.vehicle;
    const warmupTarget = warmupTargetC(profile);
    const thermostatOpen = profile.thermostatOpenC.value;
    const cues: CareCue[] = [];

    if (this.warmupStart == null && isEngineRunning(snapshot)) {
      this.warmupStart = now;
      this.warmupWork = 0;
      this.lastSampleAt = now;
    }

    if (!this.warmupDone && this.warmupStart != null) {
      const dt = this.lastSampleAt != null ? Math.min(2, (now - this.lastSampleAt) / 1000) : 1;
      this.lastSampleAt = now;
      this.warmupWork += normLoad * rpm * dt;
      if (speed >= 5) {
        this.movingMs += dt * 1000;
        this.movingDistanceKm += (speed / 3600) * dt;
      }

      // Deterministic rule, independent of the learned baseline: the car has genuinely
      // driven a while and the coolant is still well short of the thermostat's opening
      // point. This is the "araç ilerlemesine rağmen motor yavaş ısınıyor" case, and it
      // fires on the first cold trip rather than waiting for a baseline to mature.
      const coldPenaltyKm = Math.min(Math.max((15 - ambient) * 0.25, 0), 4);
      if (
        !this.slowWarmupAnnounced &&
        this.movingDistanceKm >= SLOW_WARMUP_MIN_DISTANCE_KM + coldPenaltyKm &&
        this.movingMs >= SLOW_WARMUP_MIN_MOVING_MS &&
        coolant < warmupTarget - 10
      ) {
        this.slowWarmupAnnounced = true;
        cues.push({
          id: "thermostat.slowWarmup",
          text: "Engine still hasn't reached operating temperature after several km — thermostat may be stuck open.",
          severity: "protective",
        });
        db.insert(protectionEvents)
          .values({ id: `pe_${now}_${Math.random().toString(36).slice(2, 6)}`, type: "thermostat", severity: "alarm", t: now, value: coolant, thresholdUsed: warmupTarget })
          .catch(() => undefined);
      }

      if (coolant >= warmupTarget) {
        const normFactor = 1 + Math.max(0, 20 - ambient) * 0.02;
        const wNorm = this.warmupWork / normFactor;
        const bucket = bucketAmbient(ambient);
        baselineLearner.observe("warmup.work", wNorm, bucket, 8, [0, 5_000_000], now).catch(() => undefined);
        const snap = baselineLearner.snapshot("warmup.work", bucket);
        if (snap?.isMature && wNorm > snap.p50 * 1.6) {
          this.consecutiveSlow += 1;
          if (this.consecutiveSlow >= 3) {
            cues.push({ id: "thermostat.slow", text: "Engine is taking longer than usual to warm up — possible stuck-open thermostat.", severity: "coach" });
          }
        } else if (snap && wNorm <= snap.p50) {
          this.consecutiveSlow = 0;
        }
        this.warmupDone = true;
      }

      const openTimeoutMs = (ambient > 5 ? 900 : 1500) * 1000;
      if (this.warmupStart != null && now - this.warmupStart > openTimeoutMs && coolant < warmupTarget - 8) {
        cues.push({ id: "thermostat.open", text: "Coolant is slow to reach operating temperature — thermostat may be stuck open.", severity: "coach" });
      }
    }

    if (speed > 80) {
      if (this.highwayCoolSince == null) this.highwayCoolSince = now;
      const coldPenalty = Math.min(Math.max((10 - ambient) * 0.6, 0), 8);
      if (now - this.highwayCoolSince >= 300_000 && coolant < thermostatOpen - 12 - coldPenalty) {
        cues.push({ id: "thermostat.highway", text: "Engine runs noticeably cooler at highway speed than expected.", severity: "coach" });
        this.highwayCoolSince = now + 600_000;
      }
    } else {
      this.highwayCoolSince = undefined;
    }

    if (this.warmupDone) {
      if (this.lastCoolant != null && coolant - this.lastCoolant > 2 && this.spikeWatchStart == null) {
        this.spikeWatchStart = now;
      }
      if (this.spikeWatchStart != null) {
        const first = this.plateauSamples[0]?.c;
        if (first != null && now - this.spikeWatchStart <= 60_000 && coolant - first >= 12 && speed >= 5) {
          cues.push({ id: "thermostat.closed", text: "Coolant temperature spiked suddenly — thermostat may be stuck closed.", severity: "protective" });
          db.insert(protectionEvents)
            .values({ id: `pe_${now}_${Math.random().toString(36).slice(2, 6)}`, type: "thermostat", severity: "alarm", t: now, value: coolant, thresholdUsed: 12 })
            .catch(() => undefined);
          this.spikeWatchStart = undefined;
        } else if (now - this.spikeWatchStart > 60_000) {
          this.spikeWatchStart = undefined;
        }
      }
    }

    this.plateauSamples.push({ t: now, c: coolant });
    this.plateauSamples = this.plateauSamples.filter((s) => now - s.t <= 180_000);
    if (speed > 50 && this.plateauSamples.length > 1) {
      const vals = this.plateauSamples.map((s) => s.c);
      if (Math.max(...vals) - Math.min(...vals) >= 7) {
        cues.push({ id: "thermostat.plateau", text: "Coolant temperature is bouncing around at speed.", severity: "coach" });
      }
    }

    this.lastCoolant = coolant;
    return cues;
  }

  resetTrip(): void {
    this.warmupStart = undefined;
    this.warmupWork = 0;
    this.lastSampleAt = undefined;
    this.warmupDone = false;
    this.consecutiveSlow = 0;
    this.highwayCoolSince = undefined;
    this.lastCoolant = undefined;
    this.spikeWatchStart = undefined;
    this.plateauSamples = [];
    this.movingMs = 0;
    this.movingDistanceKm = 0;
    this.slowWarmupAnnounced = false;
  }
}

export const thermostatWatch = new ThermostatWatch();
