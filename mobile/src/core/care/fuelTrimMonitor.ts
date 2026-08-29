import { db } from "../storage/db";
import { protectionEvents } from "../storage/schema";
import { baselineLearner } from "./baselineLearner";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip } from "../storage/models";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

interface BandHit {
  tripIds: Set<string>;
  durationS: number;
}

const THERMOSTAT_OPEN_C = 88;

/** Watches long-term fuel trim for a
 * lean/rich drift pattern across trips (skipping the unported ethanol/altitude
 * bucket adjustments from the vehicle-profile system). */
class FuelTrimMonitor implements CareFeature {
  id = "fuelTrim";

  private bandAccum: Record<string, { sum: number; n: number }> = {};
  private sessionHits: Record<string, BandHit> = {};

  isEnabled(settings: { careFuelTrimMonitor: boolean }): boolean {
    return settings.careFuelTrimMonitor;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    if (snapshot.ltftBank1 == null) return [];
    const stft = snapshot.stftBank1 ?? 0;
    const total = snapshot.ltftBank1 + stft;
    const coolant = snapshot.coolantC ?? 0;
    const fuel = snapshot.fuelLevelPct ?? 100;
    const normLoad = snapshot.engineLoadPct ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    const rpm = snapshot.rpm ?? 0;

    if (coolant <= THERMOSTAT_OPEN_C - 5 || fuel <= 15) return [];
    if (normLoad < 5 && rpm > 1200) return []; // decel fuel-cutoff proxy — trim not representative

    let band: string;
    if (speed <= 3 && normLoad <= 25) band = "idle";
    else if (normLoad >= 25 && normLoad <= 65) band = "part";
    else if (normLoad >= 65) band = "high";
    else return [];

    baselineLearner.observe(`ltft.${band}`, total, "", 60, [-40, 40], context.now).catch(() => undefined);
    const acc = this.bandAccum[band] ?? { sum: 0, n: 0 };
    acc.sum += total;
    acc.n += 1;
    this.bandAccum[band] = acc;

    return [];
  }

  onTripEnded(trip: Trip, context: CareContext): CareCue[] {
    // Taken before the reset, not read through `this` afterwards: the closure
    // used to resolve `this.bandAccum` at call time, by which point it had
    // already been emptied two lines above, so every average came back
    // undefined and no drift pattern could ever match.
    const accum = this.bandAccum;
    this.bandAccum = {};
    const avg = (band: string) => {
      const acc = accum[band];
      return acc && acc.n > 0 ? acc.sum / acc.n : undefined;
    };
    if (trip.durationS < 60) return [];

    const idleAvg = avg("idle");
    const partAvg = avg("part");
    const highAvg = avg("high");

    let pattern: string | undefined;
    if (idleAvg != null && idleAvg > 20 && (partAvg ?? 0) <= 10 && (highAvg ?? 0) <= 10) pattern = "lean_idle";
    else if (idleAvg != null && idleAvg > 20 && (partAvg ?? 0) > 20) pattern = "lean_all";
    else if (highAvg != null && highAvg > 20 && (idleAvg ?? 0) <= 10) pattern = "lean_high";
    else if (idleAvg != null && idleAvg < -20 && (partAvg ?? 0) < -20) pattern = "rich_all";
    if (!pattern) return [];

    const hit = this.sessionHits[pattern] ?? { tripIds: new Set<string>(), durationS: 0 };
    hit.tripIds.add(trip.id);
    hit.durationS += trip.durationS;
    this.sessionHits[pattern] = hit;

    if (hit.tripIds.size < 3 || hit.durationS < 20 * 60) return [];

    db.insert(protectionEvents)
      .values({
        id: `pe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: "fuelTrim",
        severity: "alarm",
        t: Date.now(),
        value: idleAvg ?? partAvg ?? highAvg ?? 0,
        thresholdUsed: 20,
      })
      .catch(() => undefined);

    // Cleared once announced, so the pattern has to establish itself again
    // before it speaks. Without this the counters stay over the threshold and
    // every later trip with the same drift repeats the same cue forever.
    delete this.sessionHits[pattern];

    return [{ id: "trim.drift", text: "Fuel trim has been drifting outside normal range across recent trips.", severity: "coach" }];
  }

  resetTrip(): void {
    this.bandAccum = {};
  }
}

export const fuelTrimMonitor = new FuelTrimMonitor();
