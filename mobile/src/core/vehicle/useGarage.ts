import { create } from "zustand";
import {
  vehicleRepository,
  shouldOfferAdoption,
  type GarageVehicle,
  type UnassignedHistory,
} from "./vehicleRepository";

export interface AddVehicleResult {
  vehicle: GarageVehicle;
  /** True when this is the user's first described car and there is unowned
   * history that could belong to it. */
  offerAdoption: boolean;
  unassigned: UnassignedHistory;
}

interface GarageState {
  vehicles: GarageVehicle[];
  activeId?: string;
  ready: boolean;

  load: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  addVehicle: (name: string) => Promise<AddVehicleResult>;
  adoptHistory: (vehicleId: string) => Promise<void>;
  updateVehicle: (id: string, patch: Partial<GarageVehicle>) => Promise<void>;
  removeVehicle: (id: string) => Promise<boolean>;
}

export const useGarage = create<GarageState>((set, get) => ({
  vehicles: [],
  ready: false,

  load: async () => {
    const active = await vehicleRepository.ensureDefault();
    const vehicles = await vehicleRepository.all();
    set({ vehicles, activeId: active.id, ready: true });
  },

  setActive: async (id) => {
    await vehicleRepository.setActive(id);
    set({ vehicles: await vehicleRepository.all(), activeId: id });
  },

  addVehicle: async (name) => {
    // Captured before the insert: whether to offer the history turns on what the
    // garage held a moment ago, not on the car being added.
    const before = get().vehicles;
    const vehicle = await vehicleRepository.create({ name });
    set({ vehicles: await vehicleRepository.all() });

    const unassigned = await vehicleRepository.unassignedHistory();
    return {
      vehicle,
      offerAdoption: shouldOfferAdoption(before, unassigned),
      unassigned,
    };
  },

  adoptHistory: async (vehicleId) => {
    await vehicleRepository.adoptHistory(vehicleId);
    const vehicles = await vehicleRepository.all();
    set({ vehicles, activeId: vehicles.find((v) => v.isActive)?.id });
  },

  updateVehicle: async (id, patch) => {
    await vehicleRepository.update(id, patch);
    set({ vehicles: await vehicleRepository.all() });
  },

  removeVehicle: async (id) => {
    const removed = await vehicleRepository.remove(id);
    if (removed) {
      const vehicles = await vehicleRepository.all();
      set({ vehicles, activeId: vehicles.find((v) => v.isActive)?.id });
    }
    return removed;
  },
}));

/**
 * Id of the vehicle every write and query belongs to.
 *
 * Repositories call this rather than taking a vehicle argument, so scoping did
 * not have to be threaded through every existing call site. Undefined only
 * before the garage has loaded, where queries fall back to unscoped reads.
 */
export function activeVehicleId(): string | undefined {
  return useGarage.getState().activeId;
}

export function activeVehicle(): GarageVehicle | undefined {
  const { vehicles, activeId } = useGarage.getState();
  return vehicles.find((v) => v.id === activeId);
}

/**
 * Whether rows with no owner should be shown as the active vehicle's.
 *
 * Records written before the garage existed belong to nobody until the user
 * says otherwise. The placeholder vehicle stands in for them so an upgraded
 * install loses nothing; a car the user actually described does not, because
 * claiming another car's history silently is exactly what the adoption prompt
 * exists to avoid. Also true before the garage has loaded, so early reads see
 * everything rather than nothing.
 */
export function activeVehicleAdoptsOrphans(): boolean {
  const { vehicles, activeId } = useGarage.getState();
  if (!activeId) return true;
  return vehicles.find((v) => v.id === activeId)?.isSeeded ?? true;
}
