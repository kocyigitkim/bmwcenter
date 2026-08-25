import { useRemoteFuelPrices } from "./remoteFuelPriceStore";
import { useAppSettings } from "../settings/appSettings";
import type { FuelType } from "../settings/appSettings";

/** The price actually used for cost math: today's live price for the vehicle's fuel type
 * (from openvan.camp) when we have one, falling back to the user's manual override
 * (`settings.pricePerLiter`) otherwise — and, per a failed daily fetch, simply whatever
 * live price we last wrote (the store never clears a value on fetch failure). */
export function effectivePricePerLiter(fuelType?: FuelType): number {
  const settings = useAppSettings.getState();
  const ft = fuelType ?? settings.fuelType;
  const live = useRemoteFuelPrices.getState().priceFor(ft);
  return live ?? settings.pricePerLiter;
}

export function useEffectivePricePerLiter(): number {
  const fuelType = useAppSettings((s) => s.fuelType);
  const manual = useAppSettings((s) => s.pricePerLiter);
  const live = useRemoteFuelPrices((s) => s[fuelType]);
  return live ?? manual;
}
