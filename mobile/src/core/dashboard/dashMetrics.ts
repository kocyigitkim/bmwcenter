import type { AppSettingsState } from "../settings/appSettings";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import { boostKpa } from "../obd/vehicleSnapshot";
import { estimatedRangeKm } from "../fuel/fuelCalculator";
import { isValidAvgL100 } from "../storage/models";

type Settings = Pick<AppSettingsState, "unitSystem" | "temperatureUnit" | "pressureUnit" | "consumptionUnit" | "tankCapacityL">;

export function displaySpeed(kmh: number | undefined, settings: Settings): number | undefined {
  if (kmh == null) return undefined;
  return settings.unitSystem === "metric" ? kmh : kmh * 0.621371;
}

export function speedUnitKey(settings: Settings): string {
  return settings.unitSystem === "metric" ? "unit.kmh" : "unit.mph";
}

export function displayTemp(celsius: number | undefined, settings: Settings): number | undefined {
  if (celsius == null) return undefined;
  return settings.temperatureUnit === "celsius" ? celsius : (celsius * 9) / 5 + 32;
}

export function tempUnitKey(settings: Settings): string {
  return settings.temperatureUnit === "celsius" ? "unit.celsius" : "unit.fahrenheit";
}

export function tempRange(settings: Settings): [number, number] {
  return settings.temperatureUnit === "celsius" ? [0, 160] : [32, 320];
}

export function temperatureText(celsius: number | undefined, settings: Settings): string | undefined {
  const value = displayTemp(celsius, settings);
  return value != null ? String(Math.round(value)) : undefined;
}

export function progress(value: number | undefined, range: [number, number]): number {
  if (value == null) return 0;
  const [lo, hi] = range;
  return Math.min(Math.max((value - lo) / (hi - lo), 0), 1);
}

export function boostValue(snapshot: VehicleSnapshot, settings: Settings): number | undefined {
  const kpa = boostKpa(snapshot);
  if (kpa == null) return undefined;
  switch (settings.pressureUnit) {
    case "bar":
      return kpa / 100;
    case "kpa":
      return kpa;
    case "psi":
      return kpa * 0.145038;
  }
}

export function boostUnitKey(settings: Settings): string {
  switch (settings.pressureUnit) {
    case "bar":
      return "unit.bar";
    case "kpa":
      return "unit.kpa";
    case "psi":
      return "unit.psi";
  }
}

export function boostRange(settings: Settings): [number, number] {
  switch (settings.pressureUnit) {
    case "bar":
      return [-1.0, 2.5];
    case "kpa":
      return [-100, 250];
    case "psi":
      return [-15, 36];
  }
}

export function instantValueText(
  snapshot: VehicleSnapshot,
  instantL100: number | undefined,
  idleLh: number | undefined,
  settings: Settings
): { value?: number; isIdle: boolean } {
  if ((snapshot.speedKmh ?? Infinity) <= 3 && idleLh != null) {
    return { value: idleLh, isIdle: true };
  }
  if (instantL100 == null || instantL100 < 0.5 || instantL100 > 60) return { isIdle: false };
  let value: number;
  switch (settings.consumptionUnit) {
    case "l100km":
      value = instantL100;
      break;
    case "kmPerL":
      value = 100 / instantL100;
      break;
    case "mpgUS":
      value = 235.215 / instantL100;
      break;
    case "mpgUK":
      value = 282.481 / instantL100;
      break;
  }
  return { value, isIdle: false };
}

export function instantUnitKey(snapshot: VehicleSnapshot, idleLh: number | undefined, settings: Settings): string {
  if ((snapshot.speedKmh ?? Infinity) <= 3 && idleLh != null) return "unit.literPerHour";
  switch (settings.consumptionUnit) {
    case "l100km":
      return "unit.l100km";
    case "kmPerL":
      return "unit.kmPerL";
    case "mpgUS":
      return "unit.mpgUS";
    case "mpgUK":
      return "unit.mpgUK";
  }
}

export function rangeKm(
  snapshot: VehicleSnapshot,
  instantL100: number | undefined,
  tankCapacityL: number
): number | undefined {
  const avg = isValidAvgL100(instantL100 ?? -1) ? instantL100 : undefined;
  return estimatedRangeKm(snapshot.fuelLevelPct, tankCapacityL, avg);
}
