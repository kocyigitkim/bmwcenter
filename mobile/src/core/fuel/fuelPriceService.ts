import * as Localization from "expo-localization";
import { useRemoteFuelPrices } from "./remoteFuelPriceStore";
import { parseResponse } from "./fuelPriceParser";
import { useAlertEngine } from "../alerts/alertEngine";
import { useAppSettings } from "../settings/appSettings";

const ENDPOINT = "https://openvan.camp/api/fuel/prices?source=myapp";
const MIN_CHECK_INTERVAL_MS = 24 * 3600_000;

/** The API returns every country at once, keyed by ISO code — pick the device's own
 * region, falling back to Turkey (this app's default market: TRY currency, tr language). */
function resolveCountryCode(): string {
  return Localization.getLocales()[0]?.regionCode ?? "TR";
}

/** Keeps `settings.pricePerLiter` mirroring the live price for the vehicle's current fuel
 * type — it's a read-only display field in Settings, not something the user edits by hand,
 * so it must always reflect "the last value we successfully wrote" for that fuel type. */
function syncSettingsPriceFromRemote(): void {
  const settings = useAppSettings.getState();
  const live = useRemoteFuelPrices.getState().priceFor(settings.fuelType);
  if (live != null && live !== settings.pricePerLiter) {
    settings.set("pricePerLiter", live);
  }
}

// Re-sync whenever the vehicle's fuel type changes (a different fuel type has a different
// live price) — the fetch-driven sync alone wouldn't catch this until the next daily check.
useAppSettings.subscribe((state, prev) => {
  if (state.fuelType !== prev.fuelType) syncSettingsPriceFromRemote();
});

/** Fetches today's prices and, if the vehicle's own fuel type changed price, raises a
 * push notification + in-app chip. Never throws — on any failure the previously stored
 * values are left untouched, so callers keep using "the last value we successfully wrote". */
export async function fetchAndApplyFuelPrices(): Promise<void> {
  const now = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const response = await fetch(ENDPOINT, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const parsed = parseResponse(json, resolveCountryCode());

    const store = useRemoteFuelPrices.getState();
    const prevVehiclePrice = store.priceFor(useAppSettings.getState().fuelType);
    const changed = store.applyFetch(parsed, parsed.currencyCode, now);

    const vehicleFuelType = useAppSettings.getState().fuelType;
    if (changed.includes(vehicleFuelType) && prevVehiclePrice != null) {
      const newPrice = useRemoteFuelPrices.getState().priceFor(vehicleFuelType)!;
      const currency = useRemoteFuelPrices.getState().currencyCode ?? useAppSettings.getState().currencyCode;
      await useAlertEngine.getState().notifyFuelPriceChanged(vehicleFuelType, prevVehiclePrice, newPrice, currency);
    }
    syncSettingsPriceFromRemote();
  } catch {
    // Network/parse failure: leave stored prices as-is (last known value keeps being used).
    useRemoteFuelPrices.getState().markChecked(now);
  }
}

/** Runs a fetch if we haven't checked in the last 24h. Safe to call often (e.g. on every
 * app foreground) — it's a no-op most of the time. */
export async function fetchFuelPricesIfDue(): Promise<void> {
  const { lastCheckedAt } = useRemoteFuelPrices.getState();
  const now = Date.now();
  if (lastCheckedAt != null && now - lastCheckedAt < MIN_CHECK_INTERVAL_MS) return;
  await fetchAndApplyFuelPrices();
}

export { parseResponse, syncSettingsPriceFromRemote };
