import { create } from "zustand";
import { vehicleRepository, type GarageVehicle } from "./vehicleRepository";

interface GarageState {
  vehicles: GarageVehicle[];
  activeId?: string;
  ready: boolean;

  load: () => Promise<void>;
  setActive: (id: string) => Promise<void>;
  addVehicle: (name: string) => Promise<GarageVehicle>;
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
    const vehicle = await vehicleRepository.create({ name });
    set({ vehicles: await vehicleRepository.all() });
    return vehicle;
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
