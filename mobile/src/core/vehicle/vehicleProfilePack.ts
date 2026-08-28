import type { FuelType, VehiclePlatform } from "../settings/appSettings";
import {
  archetypeDefaultFuel,
  archetypeProfile,
  parseConfidence,
  type BatteryChem,
  type Confidence,
  type VehicleArchetype,
  type VehicleDiagnosticProfile,
} from "./vehicleProfile";

export interface ModelEntry {
  id: string;
  make: string;
  model: string;
  matchModel: string[];
  matchEngine: string[];
  archetype: VehicleArchetype;
  tstat: number;
  mapControlled: boolean;
  capBar: number;
  batteryChem: BatteryChem;
  smartAlternator: boolean;
  confidence: string;
  flags?: string[];
  engineLabel?: string;
  yearFrom?: number;
  yearTo?: number;
  tankL?: number;
  displacementL?: number;
  fuel?: FuelType;
  pidPack?: VehiclePlatform;
}

export interface BrandEntry {
  make: string;
  archetype: VehicleArchetype;
  tstat: number;
  mapControlled: boolean;
  capBar: number;
  batteryChem: BatteryChem;
  smartAlternator: boolean;
  confidence: string;
}

export interface VehicleProfilePack {
  schemaVersion: number;
  packVersion: string;
  models: ModelEntry[];
  brands: BrandEntry[];
}

// Bundled by Metro at build time; the catalog is small enough to ship in the app.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bundled = require("../../../assets/vehicleProfilePack.json") as VehicleProfilePack;

export function loadBundledPack(): VehicleProfilePack {
  return bundled;
}

export function engineLabelFor(entry: ModelEntry): string {
  if (entry.engineLabel) return entry.engineLabel;
  const first = entry.matchEngine[0];
  return first ? first.toUpperCase() : entry.archetype;
}

export function allMakes(pack: VehicleProfilePack): string[] {
  const makes = new Set<string>();
  for (const m of pack.models) makes.add(m.make);
  for (const b of pack.brands) makes.add(b.make);
  return [...makes].sort((a, b) => a.localeCompare(b));
}

export function modelsForMake(pack: VehicleProfilePack, make: string): ModelEntry[] {
  return pack.models.filter((m) => m.make.toLowerCase() === make.toLowerCase());
}

const MAKE_ALIASES: Record<string, string> = {
  "ford europe": "Ford",
  "bmw m": "BMW",
  "bmw i": "BMW",
  citroen: "Citroën",
  mercedes: "Mercedes-Benz",
  daimler: "Mercedes-Benz",
  vw: "Volkswagen",
  landrover: "Land Rover",
  alfa: "Alfa Romeo",
};

export function canonicalMake(raw: string, pack?: VehicleProfilePack): string {
  const trimmed = raw.trim();
  const aliased = MAKE_ALIASES[trimmed.toLowerCase()] ?? trimmed;
  if (pack) {
    const match = allMakes(pack).find((m) => m.toLowerCase() === aliased.toLowerCase());
    if (match) return match;
  }
  return aliased;
}

/** Layers the catalog's verified fields over the archetype prior, keeping the entry's
 * confidence so downstream code knows how much to trust each threshold. */
export function profileFromModelEntry(entry: ModelEntry, fuelOverride?: FuelType): VehicleDiagnosticProfile {
  const fuel = fuelOverride ?? entry.fuel ?? archetypeDefaultFuel(entry.archetype);
  const profile = archetypeProfile(entry.archetype, fuel);
  const confidence: Confidence = parseConfidence(entry.confidence);
  const source = "service";

  profile.id = entry.id;
  profile.make = entry.make;
  profile.model = entry.model;
  profile.engineLabel = engineLabelFor(entry);
  profile.fuel = fuel;
  profile.displacementL = entry.displacementL ?? profile.displacementL;
  profile.tankCapacityL = entry.tankL ?? profile.tankCapacityL;
  profile.pidPack = entry.pidPack ?? "universal";
  profile.overallConfidence = confidence;
  profile.thermostatOpenC = { value: entry.tstat, confidence, source };
  profile.mapControlledThermostat = { value: entry.mapControlled, confidence, source };
  profile.capPressureBar = { value: entry.capBar, confidence, source };
  profile.batteryChem = entry.batteryChem;
  profile.smartAlternator = entry.smartAlternator;
  if (entry.yearFrom != null) profile.modelYear = entry.yearFrom;
  for (const flag of entry.flags ?? []) profile.flags.add(flag);
  return profile;
}

export function profileFromBrandEntry(entry: BrandEntry, fuelOverride?: FuelType): VehicleDiagnosticProfile {
  const fuel = fuelOverride ?? archetypeDefaultFuel(entry.archetype);
  const profile = archetypeProfile(entry.archetype, fuel);
  const confidence: Confidence = parseConfidence(entry.confidence);
  const source = "brand";

  profile.id = `brand.${entry.make.trim().toLowerCase().replace(/ /g, "-")}`;
  profile.make = entry.make;
  profile.fuel = fuel;
  profile.overallConfidence = confidence;
  profile.thermostatOpenC = { value: entry.tstat, confidence, source };
  profile.mapControlledThermostat = { value: entry.mapControlled, confidence, source };
  profile.capPressureBar = { value: entry.capBar, confidence, source };
  profile.batteryChem = entry.batteryChem;
  profile.smartAlternator = entry.smartAlternator;
  return profile;
}
