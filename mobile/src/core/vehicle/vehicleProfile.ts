import type { FuelType, VehiclePlatform } from "../settings/appSettings";

/** How trustworthy a profile field is. `c` values are archetype priors — they may seed
 * learning but must never on their own drive an alarm. */
export type Confidence = "a" | "b" | "c";

export const confidenceRank: Record<Confidence, number> = { a: 2, b: 1, c: 0 };

export function parseConfidence(raw: string): Confidence {
  const value = raw.trim().toLowerCase();
  return value === "a" || value === "b" || value === "c" ? value : "c";
}

export type VehicleArchetype =
  | "gasolineNA"
  | "gasolineTurboDI"
  | "gasolineTurboEuro"
  | "dieselDPF"
  | "dieselHeavy"
  | "hybridFHEV"
  | "mildHybrid48V"
  | "ev";

export const ALL_ARCHETYPES: VehicleArchetype[] = [
  "gasolineNA",
  "gasolineTurboDI",
  "gasolineTurboEuro",
  "dieselDPF",
  "dieselHeavy",
  "hybridFHEV",
  "mildHybrid48V",
  "ev",
];

export type Aspiration = "na" | "turbo" | "twinTurbo" | "supercharged";
export type BatteryChem = "flooded" | "efb" | "agm" | "lithium";
export type OilGrade = "w0_20" | "w5_30" | "w5_40";

export function archetypeDefaultFuel(archetype: VehicleArchetype): FuelType {
  return archetype === "dieselDPF" || archetype === "dieselHeavy" ? "diesel" : "gasoline";
}

export function archetypeDefaultIsTurbo(archetype: VehicleArchetype): boolean {
  switch (archetype) {
    case "gasolineNA":
    case "hybridFHEV":
    case "ev":
      return false;
    default:
      return true;
  }
}

export interface ProfileField<T> {
  value: T;
  confidence: Confidence;
  source: string;
}

function field<T>(value: T, confidence: Confidence, source: string): ProfileField<T> {
  return { value, confidence, source };
}

/** Per-vehicle diagnostic constants. Everything the thermal watchdogs need to judge
 * "normal" for *this* engine rather than against one hardcoded threshold. */
export interface VehicleDiagnosticProfile {
  id: string;
  make: string;
  model: string;
  modelYear: number;
  archetype: VehicleArchetype;
  overallConfidence: Confidence;
  engineLabel: string;

  fuel: FuelType;
  aspiration: Aspiration;
  displacementL: number;
  redlineRpm: number;
  idleRpmNominal: number;
  tankCapacityL: number;

  thermostatOpenC: ProfileField<number>;
  mapControlledThermostat: ProfileField<boolean>;
  fanOnC: ProfileField<number>;
  capPressureBar: ProfileField<number>;
  hasAuxElectricCoolantPump: ProfileField<boolean>;

  turboWaterCooled: boolean;
  oilGrade: OilGrade;

  hasDPF: boolean;
  hasEGR: boolean;
  hasGlowPlugs: boolean;

  batteryChem: BatteryChem;
  batteryAh: number;
  smartAlternator: boolean;
  hasStartStop: boolean;
  dcdcConverter: boolean;

  pidPack: VehiclePlatform;
  flags: Set<string>;
}

// --- Derived thermal envelope -------------------------------------------------------

/** Normal operating ceiling. Map-controlled thermostats deliberately run 100-110 °C at
 * part load, so they get a flat ceiling rather than an offset from the opening point. */
export function coolantNormalTopC(p: VehicleDiagnosticProfile): number {
  return p.mapControlledThermostat.value ? 108 : p.thermostatOpenC.value + 13;
}

/** Boiling ceiling for a 50% glycol mix at the given cap pressure (1.1 bar -> 121 °C). */
export function boilingCeilingC(p: VehicleDiagnosticProfile): number {
  return 108 + p.capPressureBar.value * 12;
}

export function coolantWatchC(p: VehicleDiagnosticProfile): number {
  return coolantNormalTopC(p) + 3;
}

export function coolantAlarmC(p: VehicleDiagnosticProfile): number {
  return Math.min(coolantNormalTopC(p) + 8, boilingCeilingC(p) - 6);
}

export function coolantCriticalC(p: VehicleDiagnosticProfile): number {
  return Math.min(coolantNormalTopC(p) + 14, boilingCeilingC(p));
}

export function effectiveFanOnC(p: VehicleDiagnosticProfile): number {
  return p.fanOnC.value > 0 ? p.fanOnC.value : p.thermostatOpenC.value + 12;
}

export function warmupTargetC(p: VehicleDiagnosticProfile): number {
  return p.thermostatOpenC.value - 3;
}

export function oilWarmC(p: VehicleDiagnosticProfile): number {
  return p.oilGrade === "w0_20" ? 75 : 80;
}

export function hasNoICE(p: VehicleDiagnosticProfile): boolean {
  return p.flags.has("noICE") || p.archetype === "ev";
}

// --- Archetype defaults -------------------------------------------------------------

interface ArchetypeSpec {
  aspiration: Aspiration;
  thermostatC: number;
  mapControlled: boolean;
  fanOnC: number;
  capBar: number;
  batteryChem: BatteryChem;
  smartAlternator: boolean;
  trimEnabled: boolean;
  turboWaterCooled?: boolean;
  hasAuxPump?: boolean;
  hasDPF?: boolean;
  hasEGR?: boolean;
  glowPlugs?: boolean;
  dcdc?: boolean;
  flags?: string[];
  fuel?: FuelType;
}

const ARCHETYPE_SPECS: Record<VehicleArchetype, ArchetypeSpec> = {
  gasolineNA: {
    aspiration: "na", thermostatC: 87, mapControlled: false, fanOnC: 99, capBar: 1.1,
    batteryChem: "flooded", smartAlternator: false, trimEnabled: true, fuel: "gasoline",
  },
  gasolineTurboDI: {
    aspiration: "turbo", thermostatC: 90, mapControlled: false, fanOnC: 102, capBar: 1.4,
    batteryChem: "efb", smartAlternator: true, trimEnabled: true, turboWaterCooled: true,
    fuel: "gasoline",
  },
  gasolineTurboEuro: {
    aspiration: "turbo", thermostatC: 95, mapControlled: true, fanOnC: 104, capBar: 2.0,
    batteryChem: "agm", smartAlternator: true, trimEnabled: true, turboWaterCooled: true,
    fuel: "gasoline",
  },
  dieselDPF: {
    aspiration: "turbo", thermostatC: 82, mapControlled: false, fanOnC: 95, capBar: 1.4,
    batteryChem: "efb", smartAlternator: true, trimEnabled: false, turboWaterCooled: true,
    hasDPF: true, hasEGR: true, glowPlugs: true, fuel: "diesel",
  },
  dieselHeavy: {
    aspiration: "turbo", thermostatC: 80, mapControlled: false, fanOnC: 93, capBar: 1.4,
    batteryChem: "flooded", smartAlternator: false, trimEnabled: false,
    hasDPF: true, hasEGR: true, glowPlugs: true, fuel: "diesel",
  },
  hybridFHEV: {
    aspiration: "na", thermostatC: 82, mapControlled: false, fanOnC: 96, capBar: 1.1,
    batteryChem: "agm", smartAlternator: false, trimEnabled: true, dcdc: true,
    flags: ["iceIntermittent", "noThermalShockModule", "noIdleModule"], fuel: "gasoline",
  },
  mildHybrid48V: {
    aspiration: "turbo", thermostatC: 90, mapControlled: true, fanOnC: 102, capBar: 1.4,
    batteryChem: "agm", smartAlternator: true, trimEnabled: true, turboWaterCooled: true,
    hasAuxPump: true, flags: ["startStopFrequent"],
  },
  ev: {
    aspiration: "na", thermostatC: 0, mapControlled: false, fanOnC: 38, capBar: 1.2,
    batteryChem: "lithium", smartAlternator: false, trimEnabled: false, dcdc: true,
    flags: ["noICE"], fuel: "gasoline",
  },
};

/** Fallback used whenever the catalog cannot identify the car. Every field is tagged
 * confidence `c`, marking it a prior rather than a verified figure. */
export function archetypeProfile(archetype: VehicleArchetype, fuel: FuelType): VehicleDiagnosticProfile {
  const spec = ARCHETYPE_SPECS[archetype];
  const flags = new Set(spec.flags ?? []);
  if (!spec.trimEnabled) flags.add("fuelTrimDisabled");
  const resolvedFuel = spec.fuel ?? fuel;

  return {
    id: `archetype.${archetype}`,
    make: "generic",
    model: archetype,
    modelYear: 0,
    archetype,
    overallConfidence: "c",
    engineLabel: archetype,
    fuel: resolvedFuel,
    aspiration: spec.aspiration,
    displacementL: 1.6,
    redlineRpm: resolvedFuel === "diesel" ? 4500 : 7000,
    idleRpmNominal: 800,
    tankCapacityL: 50,
    thermostatOpenC: field(spec.thermostatC, "c", "archetype"),
    mapControlledThermostat: field(spec.mapControlled, "c", "archetype"),
    fanOnC: field(spec.fanOnC, "c", "archetype"),
    capPressureBar: field(spec.capBar, "c", "archetype"),
    hasAuxElectricCoolantPump: field(spec.hasAuxPump ?? false, "c", "archetype"),
    turboWaterCooled: spec.turboWaterCooled ?? false,
    oilGrade: "w5_30",
    hasDPF: spec.hasDPF ?? false,
    hasEGR: spec.hasEGR ?? false,
    hasGlowPlugs: spec.glowPlugs ?? false,
    batteryChem: spec.batteryChem,
    batteryAh: 60,
    smartAlternator: spec.smartAlternator,
    hasStartStop: spec.smartAlternator,
    dcdcConverter: spec.dcdc ?? false,
    pidPack: "universal",
    flags,
  };
}

/** Archetype inference from OBD behaviour, for when there is no VIN or model match. */
export interface OBDPowertrainHints {
  sawZeroRpmWhileMoving?: boolean;
  boostOverBaroKpa?: number;
  idleRpm?: number;
  maxObservedRpm?: number;
  hasFuelSystemStatusPID?: boolean;
  hasRpmPID?: boolean;
}

export function inferArchetype(hints: OBDPowertrainHints): VehicleArchetype {
  if (hints.hasRpmPID === false) return "ev";
  if (hints.sawZeroRpmWhileMoving) return "hybridFHEV";
  const isTurbo = (hints.boostOverBaroKpa ?? 0) > 30;
  const isDiesel =
    hints.hasFuelSystemStatusPID === false ||
    ((hints.idleRpm ?? 900) < 900 && (hints.maxObservedRpm ?? 6000) < 5000);
  if (isDiesel) return "dieselDPF";
  return isTurbo ? "gasolineTurboDI" : "gasolineNA";
}

export function fallbackArchetype(fuel: FuelType, isTurbo: boolean): VehicleArchetype {
  if (fuel === "diesel") return "dieselDPF";
  return isTurbo ? "gasolineTurboDI" : "gasolineNA";
}
