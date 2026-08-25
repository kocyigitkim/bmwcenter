import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { FuelType } from "../settings/appSettings";
import { FUEL_TYPE_MAF_TO_LH } from "../settings/unitSystem";

export interface FuelSample {
  t: number;
  speedKmh: number;
  fuelRateLh?: number;
}

export class FuelIntegrationState {
  fuelUsedL = 0;
  distanceKm = 0;
  idleFuelL = 0;
  private prev: FuelSample | undefined;

  integrate(sample: FuelSample): void {
    const { prev } = this;
    if (!prev) {
      this.prev = sample;
      return;
    }
    const dt = (sample.t - prev.t) / 1000;
    if (!(dt > 0) || !(dt < 10)) {
      this.prev = sample;
      return;
    }
    if (sample.fuelRateLh != null && prev.fuelRateLh != null) {
      const dFuel = ((sample.fuelRateLh + prev.fuelRateLh) / 2) * (dt / 3600);
      this.fuelUsedL += dFuel;
      if (sample.speedKmh < 3) this.idleFuelL += dFuel;
    }
    const dDist = ((sample.speedKmh + prev.speedKmh) / 2) * (dt / 3600);
    this.distanceKm += dDist;
    this.prev = sample;
  }

  get avgL100(): number | undefined {
    if (!(this.distanceKm > 0.1) || !(this.fuelUsedL > 0)) return undefined;
    const v = (this.fuelUsedL / this.distanceKm) * 100;
    return v >= 0.5 && v <= 60 ? v : undefined;
  }

  get kmPerL(): number | undefined {
    return this.fuelUsedL > 0 ? this.distanceKm / this.fuelUsedL : undefined;
  }

  get mpgUS(): number | undefined {
    const { avgL100 } = this;
    return avgL100 == null ? undefined : 235.215 / avgL100;
  }

  get mpgUK(): number | undefined {
    const { avgL100 } = this;
    return avgL100 == null ? undefined : 282.481 / avgL100;
  }

  prevSpeedKmh(): number | undefined {
    return this.prev?.speedKmh;
  }
}

export function fuelRateLh(
  snapshot: VehicleSnapshot,
  fuelType: FuelType,
  displacementL: number,
  volumetricEfficiency: number,
  calibrationFactor = 1.0
): number | undefined {
  let rate: number | undefined;
  if (snapshot.engineFuelRateLh != null) {
    rate = snapshot.engineFuelRateLh;
  } else if (snapshot.mafGs != null) {
    rate = snapshot.mafGs * FUEL_TYPE_MAF_TO_LH[fuelType];
  } else if (snapshot.mapKpa != null && snapshot.intakeAirC != null && snapshot.rpm != null && snapshot.rpm > 0) {
    const imap = (snapshot.rpm * snapshot.mapKpa) / (snapshot.intakeAirC + 273.15);
    const maf = ((imap / 120.0) * volumetricEfficiency * displacementL * 28.97) / 8.314;
    rate = maf * FUEL_TYPE_MAF_TO_LH[fuelType];
  }
  if (rate == null) return undefined;
  return rate * calibrationFactor;
}

export function instantL100(
  rateLh: number | undefined,
  speedKmh: number | undefined
): { l100?: number; idleLh?: number } {
  if (rateLh == null) return {};
  if (speedKmh != null && speedKmh > 3) {
    return { l100: (rateLh / speedKmh) * 100 };
  }
  return { idleLh: rateLh };
}

export function estimatedRangeKm(
  fuelLevelPct: number | undefined,
  tankCapacityL: number,
  avgL100: number | undefined
): number | undefined {
  if (fuelLevelPct == null || avgL100 == null || !(avgL100 > 0)) return undefined;
  return ((fuelLevelPct / 100) * tankCapacityL) / avgL100 * 100;
}

export function cost(fuelUsedL: number, pricePerLiter: number): number {
  return fuelUsedL * pricePerLiter;
}

export function isValidAvgL100(value: number | undefined): boolean {
  return value != null && value >= 0.5 && value <= 60;
}
