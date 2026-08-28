import { useMemo } from "react";
import { useAppSettings } from "../settings/appSettings";
import { resolveVehicleProfile } from "./profileResolver";
import type { VehicleDiagnosticProfile } from "./vehicleProfile";

/** Resolves the active vehicle's diagnostic profile from settings. Non-reactive callers
 * (care features, watchdogs) should use this rather than reaching for the pack directly. */
export function currentVehicleProfile(): VehicleDiagnosticProfile {
  const s = useAppSettings.getState();
  return resolveVehicleProfile({
    profileId: s.vehicleProfileId,
    make: s.vehicleMake,
    model: s.vehicleModel,
    engineCode: s.vehicleEngineCode,
    fuel: s.fuelType,
    isTurbo: s.isTurbo,
  });
}

export function useVehicleProfile(): VehicleDiagnosticProfile {
  const profileId = useAppSettings((s) => s.vehicleProfileId);
  const make = useAppSettings((s) => s.vehicleMake);
  const model = useAppSettings((s) => s.vehicleModel);
  const engineCode = useAppSettings((s) => s.vehicleEngineCode);
  const fuel = useAppSettings((s) => s.fuelType);
  const isTurbo = useAppSettings((s) => s.isTurbo);

  return useMemo(
    () => resolveVehicleProfile({ profileId, make, model, engineCode, fuel, isTurbo }),
    [profileId, make, model, engineCode, fuel, isTurbo]
  );
}
