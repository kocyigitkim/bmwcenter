import { create } from "zustand";
import { storage } from "../settings/appSettings";
import type { FuelType } from "../settings/appSettings";

const STORAGE_KEY = "fuelPrice.remote.v1";

export interface RemoteFuelPrices {
  gasoline?: number;
  diesel?: number;
  lpg?: number;
  currencyCode?: string;
  /** When the values above last changed (a successful fetch that returned different numbers). */
  lastChangedAt?: number;
  /** When we last successfully fetched, regardless of whether values changed. */
  lastFetchedAt?: number;
  /** When we last attempted a fetch (success or failure) — paces daily checks. */
  lastCheckedAt?: number;
}

interface RemoteFuelPriceState extends RemoteFuelPrices {
  /** Applies a successful fetch. Returns the set of fuel types whose price changed. */
  applyFetch: (prices: Partial<Record<FuelType, number>>, currencyCode: string | undefined, now: number) => FuelType[];
  markChecked: (now: number) => void;
  /** Best available price for a fuel type: live remote price if we have one, else undefined
   * (caller falls back to the user's manual settings.pricePerLiter). Never overwritten by a
   * failed fetch, so this is always "the last value we successfully wrote". */
  priceFor: (fuelType: FuelType) => number | undefined;
}

function load(): RemoteFuelPrices {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as RemoteFuelPrices;
  } catch {
    return {};
  }
}

function persist(state: RemoteFuelPrices) {
  storage.set(
    STORAGE_KEY,
    JSON.stringify({
      gasoline: state.gasoline,
      diesel: state.diesel,
      lpg: state.lpg,
      currencyCode: state.currencyCode,
      lastChangedAt: state.lastChangedAt,
      lastFetchedAt: state.lastFetchedAt,
      lastCheckedAt: state.lastCheckedAt,
    })
  );
}

export const useRemoteFuelPrices = create<RemoteFuelPriceState>((set, get) => ({
  ...load(),

  applyFetch: (prices, currencyCode, now) => {
    const prev = get();
    const changed: FuelType[] = [];
    (["gasoline", "diesel", "lpg"] as FuelType[]).forEach((ft) => {
      const next = prices[ft];
      if (next != null && prev[ft] != null && Math.abs(next - prev[ft]!) > 0.001) changed.push(ft);
    });
    const next: RemoteFuelPrices = {
      gasoline: prices.gasoline ?? prev.gasoline,
      diesel: prices.diesel ?? prev.diesel,
      lpg: prices.lpg ?? prev.lpg,
      currencyCode: currencyCode ?? prev.currencyCode,
      lastChangedAt: changed.length ? now : prev.lastChangedAt,
      lastFetchedAt: now,
      lastCheckedAt: now,
    };
    persist(next);
    set(next);
    return changed;
  },

  markChecked: (now) => {
    const next = { ...get(), lastCheckedAt: now };
    persist(next);
    set({ lastCheckedAt: now });
  },

  priceFor: (fuelType) => get()[fuelType],
}));
