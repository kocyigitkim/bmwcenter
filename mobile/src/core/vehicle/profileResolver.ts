import type { FuelType } from "../settings/appSettings";
import {
  archetypeProfile,
  fallbackArchetype,
  inferArchetype,
  type OBDPowertrainHints,
  type VehicleDiagnosticProfile,
} from "./vehicleProfile";
import {
  canonicalMake,
  loadBundledPack,
  profileFromBrandEntry,
  profileFromModelEntry,
  type ModelEntry,
  type VehicleProfilePack,
} from "./vehicleProfilePack";

export interface ResolveInput {
  /** An explicitly chosen catalog entry always wins. */
  profileId?: string | null;
  make?: string | null;
  model?: string | null;
  engineCode?: string | null;
  fuel: FuelType;
  isTurbo: boolean;
  obdHints?: OBDPowertrainHints;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matchesModel(entry: ModelEntry, model: string): boolean {
  const target = normalize(model);
  if (!target) return false;
  if (normalize(entry.model) === target) return true;
  return entry.matchModel.some((m) => {
    const candidate = normalize(m);
    return candidate === target || target.includes(candidate);
  });
}

function matchesEngine(entry: ModelEntry, engineCode: string | null | undefined): boolean {
  if (!engineCode) return true;
  const target = normalize(engineCode);
  return entry.matchEngine.some((e) => {
    const candidate = normalize(e);
    return candidate === target || target.includes(candidate);
  });
}

function findModelEntry(
  pack: VehicleProfilePack,
  make: string | undefined,
  model: string | null | undefined,
  engineCode: string | null | undefined
): ModelEntry | undefined {
  if (!model) return undefined;
  const candidates = pack.models.filter(
    (entry) => (make == null || normalize(entry.make) === normalize(make)) && matchesModel(entry, model)
  );
  if (candidates.length === 0) return undefined;
  // An engine-code match is more specific than a model-only match, so prefer it.
  return candidates.find((entry) => engineCode != null && matchesEngine(entry, engineCode)) ?? candidates[0];
}

/**
 * Resolution order: explicit profile id -> model (+ engine code) -> brand -> archetype.
 * Always returns a profile; the archetype fallback is tagged confidence `c`.
 */
export function resolveVehicleProfile(
  input: ResolveInput,
  pack: VehicleProfilePack = loadBundledPack()
): VehicleDiagnosticProfile {
  const { profileId, model, engineCode, fuel, isTurbo, obdHints } = input;

  if (profileId) {
    const entry = pack.models.find((m) => m.id === profileId);
    if (entry) return profileFromModelEntry(entry, fuel);
  }

  const make = input.make ? canonicalMake(input.make, pack) : undefined;

  const modelEntry = findModelEntry(pack, make, model, engineCode);
  if (modelEntry) return profileFromModelEntry(modelEntry, fuel);

  if (make) {
    const brandEntry = pack.brands.find((b) => normalize(b.make) === normalize(make));
    if (brandEntry) return profileFromBrandEntry(brandEntry, fuel);
  }

  const archetype = obdHints ? inferArchetype(obdHints) : fallbackArchetype(fuel, isTurbo);
  return archetypeProfile(archetype, fuel);
}
