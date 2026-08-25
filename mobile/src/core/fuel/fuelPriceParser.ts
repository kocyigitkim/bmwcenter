import type { FuelType } from "../settings/appSettings";

export type RawPrices = Partial<Record<FuelType, number>> & { currencyCode?: string };

const NAME_ALIASES: Record<FuelType, string[]> = {
  gasoline: ["gasoline", "petrol", "benzin", "gas"],
  diesel: ["diesel", "dizel", "motorin"],
  lpg: ["lpg", "autogas"],
};

function toNumber(raw: unknown): number | undefined {
  const num = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : undefined;
  return num != null && Number.isFinite(num) ? num : undefined;
}

/** Reads gasoline/diesel/lpg (+ any of their known aliases) out of a flat "prices-like"
 * object — used both for the real openvan.camp per-country `prices` object and as a
 * defensive fallback for other shapes. */
function extractFuelPrices(container: Record<string, unknown>): Partial<Record<FuelType, number>> {
  const result: Partial<Record<FuelType, number>> = {};
  for (const fuelType of Object.keys(NAME_ALIASES) as FuelType[]) {
    for (const alias of NAME_ALIASES[fuelType]) {
      const num = toNumber(container[alias]);
      if (num != null) {
        result[fuelType] = num;
        break;
      }
    }
  }
  return result;
}

/**
 * openvan.camp's real shape (as of writing) is a per-country map:
 *   { success: true, data: { TR: { currency: "TRY", prices: { gasoline, diesel, lpg, ... } }, US: {...}, ... } }
 * `countryCode` picks which entry to read (see `resolveCountryCode`); this also tolerates
 * a few other shapes an API like this might use, so it degrades gracefully instead of
 * silently returning nothing if the response format shifts:
 *   { gasoline: 44.5, diesel: 46.2, lpg: 24.1, currency: "TRY" }
 *   { prices: { gasoline: ..., diesel: ..., lpg: ... }, currencyCode: "TRY" }
 *   { fuels: [{ type: "gasoline", price: 44.5 }, ...], currency: "TRY" }
 * Unrecognized/missing fields are simply left undefined — callers keep the last known
 * value for anything this fetch didn't provide.
 */
export function parseResponse(json: unknown, countryCode = "TR"): RawPrices {
  if (!json || typeof json !== "object") return {};
  const root = json as Record<string, unknown>;

  // Real shape: { data: { <countryCode>: { currency, prices: {...} } } }
  const dataMap = typeof root.data === "object" && root.data ? (root.data as Record<string, unknown>) : undefined;
  if (dataMap) {
    const countryEntry =
      (typeof dataMap[countryCode] === "object" && dataMap[countryCode]
        ? (dataMap[countryCode] as Record<string, unknown>)
        : undefined) ?? (Object.values(dataMap)[0] as Record<string, unknown> | undefined);
    if (countryEntry) {
      const prices = typeof countryEntry.prices === "object" && countryEntry.prices ? (countryEntry.prices as Record<string, unknown>) : countryEntry;
      const result: RawPrices = extractFuelPrices(prices);
      const currency = countryEntry.currency ?? countryEntry.local_currency;
      if (typeof currency === "string") result.currencyCode = currency;
      if (Object.keys(result).length > 0) return result;
    }
  }

  // Fallback shapes.
  const container =
    (typeof root.prices === "object" && root.prices ? (root.prices as Record<string, unknown>) : undefined) ?? root;
  const result: RawPrices = extractFuelPrices(container);
  const currency = root.currency ?? root.currencyCode ?? (container as Record<string, unknown>).currency;
  if (typeof currency === "string") result.currencyCode = currency;

  const fuelsArray = Array.isArray(root.fuels) ? root.fuels : Array.isArray(root.items) ? root.items : undefined;
  if (fuelsArray) {
    for (const entry of fuelsArray) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const typeName = String(e.type ?? e.name ?? e.fuelType ?? "").toLowerCase();
      const price = toNumber(e.price ?? e.value ?? e.pricePerLiter);
      if (price == null) continue;
      for (const fuelType of Object.keys(NAME_ALIASES) as FuelType[]) {
        if (NAME_ALIASES[fuelType].some((alias) => typeName.includes(alias))) {
          result[fuelType] = price;
        }
      }
    }
  }

  return result;
}
