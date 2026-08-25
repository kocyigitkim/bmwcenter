import type { FuelType } from "./appSettings";

export const FUEL_TYPE_AFR: Record<FuelType, number> = {
  gasoline: 14.7,
  diesel: 14.5,
  lpg: 15.6,
};

export const FUEL_TYPE_DENSITY_GL: Record<FuelType, number> = {
  gasoline: 745,
  diesel: 832,
  lpg: 540,
};

/** MAF(g/s) → L/h coefficient: 3600 / (AFR × density). */
export const FUEL_TYPE_MAF_TO_LH: Record<FuelType, number> = {
  gasoline: 0.3288,
  diesel: 0.2984,
  lpg: 0.42735,
};
