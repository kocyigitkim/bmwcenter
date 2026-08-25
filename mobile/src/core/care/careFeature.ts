import type { AppSettingsState } from "../settings/appSettings";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip } from "../storage/models";
import type { CareCue, CareContext } from "./careTypes";

export interface CareFeature {
  id: string;
  isEnabled(settings: AppSettingsState): boolean;
  evaluate(snapshot: VehicleSnapshot, context: CareContext): CareCue[];
  onTripEnded?(trip: Trip, context: CareContext): CareCue[] | Promise<CareCue[]>;
  resetTrip?(): void;
}
