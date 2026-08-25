import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { CareCue, CareContext } from "./careTypes";
import type { CareFeature } from "./careFeature";

export function shiftBand(diesel: boolean): [number, number] {
  return diesel ? [1500, 2000] : [1800, 2400];
}

/** Simple 1D k-means for gear-ratio clustering (rpm/speed samples → estimated gear centroids). */
export function clusterRatios(samples: number[], k: number): number[] {
  if (samples.length < k) return [...samples].sort((a, b) => b - a);
  const sorted = [...samples].sort((a, b) => a - b);
  let centers = Array.from({ length: k }, (_, i) => sorted[Math.min(Math.floor((i * samples.length) / k), samples.length - 1)]!);
  for (let iter = 0; iter < 12; iter++) {
    const buckets: number[][] = Array.from({ length: k }, () => []);
    for (const s of samples) {
      let bi = 0;
      let bd = Infinity;
      centers.forEach((c, i) => {
        const d = Math.abs(c - s);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      buckets[bi]!.push(s);
    }
    centers = centers.map((c, i) => (buckets[i]!.length ? buckets[i]!.reduce((a, b) => a + b, 0) / buckets[i]!.length : c));
  }
  return centers.sort((a, b) => b - a);
}

class GearCoach implements CareFeature {
  id = "gearCoach";

  private ratioSamples: number[] = [];
  private centroids: number[] = [];
  private shiftUpSince: number | undefined;
  private luggingSince: number | undefined;
  private earlySince: number | undefined;
  private sweetSpotS = 0;
  private totalS = 0;

  isEnabled(settings: { careGearCoach: boolean }): boolean {
    return settings.careGearCoach;
  }

  get sweetSpotRatio(): number {
    return this.totalS > 0 ? this.sweetSpotS / this.totalS : 0;
  }

  currentGear(rpm: number, speed: number): number | undefined {
    if (speed <= 15 || this.centroids.length === 0) return undefined;
    const ratio = rpm / Math.max(speed, 1);
    let best = 0;
    let bestDist = Infinity;
    this.centroids.forEach((c, i) => {
      const d = Math.abs(c - ratio);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return this.centroids.length - best;
  }

  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[] {
    const now = context.now;
    const rpm = snapshot.rpm ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    const load = snapshot.engineLoadPct ?? 0;
    const throttle = snapshot.throttlePct ?? 0;

    if (speed > 15 && load > 10 && throttle > 2 && throttle < 95) {
      const ratio = rpm / Math.max(speed, 1);
      this.ratioSamples.push(ratio);
      if (this.ratioSamples.length === 200) {
        this.centroids = clusterRatios(this.ratioSamples.slice(0, 200), 6);
      } else if (this.ratioSamples.length > 200 && this.ratioSamples.length % 50 === 0) {
        this.centroids = clusterRatios(this.ratioSamples.slice(-200), 6);
      }
    }

    const [lo, hi] = shiftBand(false);
    const cues: CareCue[] = [];

    if (rpm > hi && throttle < 60 && speed > 20) {
      if (this.shiftUpSince == null) this.shiftUpSince = now;
      if (now - this.shiftUpSince >= 3000) {
        cues.push({ id: "gear.shiftUp", text: "Shift up — engine is spinning higher than needed.", severity: "coach" });
        this.shiftUpSince = now + 15_000;
      }
    } else {
      this.shiftUpSince = undefined;
    }

    if (rpm < 1300 && load > 70 && speed > 5) {
      if (this.luggingSince == null) this.luggingSince = now;
      if (now - this.luggingSince >= 2000) {
        cues.push({ id: "gear.lugging", text: "Engine is lugging — shift down for this load.", severity: "protective" });
        this.luggingSince = now + 20_000;
      }
    } else {
      this.luggingSince = undefined;
    }

    if (rpm < lo && load > 55 && speed > 15) {
      if (this.earlySince == null) this.earlySince = now;
      if (now - this.earlySince >= 3000) {
        cues.push({ id: "gear.early", text: "Shifted up a bit early for this load — drop a gear.", severity: "coach" });
        this.earlySince = now + 20_000;
      }
    } else {
      this.earlySince = undefined;
    }

    if (throttle > 70 && rpm > hi + 400) {
      cues.push({ id: "gear.letShift", text: "Ease the throttle to let the transmission shift.", severity: "coach" });
    }

    this.totalS += 1;
    if (rpm >= lo && rpm <= hi) this.sweetSpotS += 1;

    return cues;
  }

  resetTrip(): void {
    this.ratioSamples = [];
    this.centroids = [];
    this.sweetSpotS = 0;
    this.totalS = 0;
  }
}

export const gearCoach = new GearCoach();
