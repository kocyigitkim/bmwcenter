import { useAppSettings } from "@/core/settings/appSettings";

function appLocale(): string {
  return useAppSettings.getState().languageCode || "en";
}

export function formatNumber(value: number, fractionDigits: number, locale?: string): string {
  return new Intl.NumberFormat(locale ?? appLocale(), {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatInteger(value: number, locale?: string): string {
  return formatNumber(value, 0, locale);
}

export const MetricFormatter = {
  number: formatNumber,
  integer: formatInteger,
  speed: (value: number, locale?: string) => formatNumber(value, 0, locale),
  rpm: (value: number, locale?: string) => formatInteger(value, locale),
  temperature: (value: number, locale?: string) => formatNumber(value, 0, locale),
  fuelLevel: (value: number, locale?: string) => formatNumber(value, 0, locale),
  consumption: (value: number, locale?: string) => formatNumber(value, value < 100 ? 1 : 0, locale),
  voltage: (value: number, locale?: string) => formatNumber(value, 1, locale),
  boost: (value: number, unitIsBar: boolean, locale?: string) => formatNumber(value, unitIsBar ? 2 : 0, locale),
  distance: (value: number, locale?: string) => formatNumber(value, value < 1000 ? 1 : 0, locale),
  liveDuration: (seconds: number): string => {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
  },
};
