export type VehicleFeature =
  | "liveDashboard"
  | "dtcRead"
  | "dtcClear"
  | "freezeFrame"
  | "emissionsReadiness"
  | "extendedEngineData";

export const ALL_VEHICLE_FEATURES: VehicleFeature[] = [
  "liveDashboard",
  "dtcRead",
  "dtcClear",
  "freezeFrame",
  "emissionsReadiness",
  "extendedEngineData",
];

export type CapabilityState = "supported" | "unsupported" | "unknown";

export interface CapabilityReason {
  feature: VehicleFeature;
  state: CapabilityState;
  detail?: string;
}

export function resolveCapability(
  feature: VehicleFeature,
  hasGenericOBD: boolean,
  vehiclePlatform: string
): CapabilityReason {
  switch (feature) {
    case "liveDashboard":
    case "dtcRead":
    case "dtcClear":
    case "freezeFrame":
    case "emissionsReadiness":
      if (hasGenericOBD) return { feature, state: "supported" };
      return { feature, state: "unknown", detail: "No supported-PID data yet for this session" };
    case "extendedEngineData":
      if (vehiclePlatform === "universal") {
        return {
          feature,
          state: "unsupported",
          detail: "Extended Mode 22 PIDs are only available on BMW profiles with a Mode 22 pack",
        };
      }
      if (hasGenericOBD) return { feature, state: "supported" };
      return { feature, state: "unknown", detail: "No supported-PID data yet for this session" };
  }
}

export function resolveAllCapabilities(hasGenericOBD: boolean, vehiclePlatform: string): CapabilityReason[] {
  return ALL_VEHICLE_FEATURES.map((f) => resolveCapability(f, hasGenericOBD, vehiclePlatform));
}
