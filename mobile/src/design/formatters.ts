import i18n from "@/i18n";
import { MetricFormatter, formatNumber } from "./metricFormatter";
import type { AppSettingsState } from "@/core/settings/appSettings";

type Settings = Pick<
  AppSettingsState,
  "unitSystem" | "temperatureUnit" | "consumptionUnit" | "pressureUnit"
>;

const t = (key: string) => i18n.t(key);

export const unavailable = () => t("common.value.unavailable");

export const Formatters = {
  number(value: number | undefined, digits = 1): string {
    if (value == null) return unavailable();
    return formatNumber(value, digits);
  },

  speed(kmh: number | undefined, settings: Settings): string {
    if (kmh == null) return unavailable();
    const value = settings.unitSystem === "metric" ? kmh : kmh * 0.621371;
    const unit = settings.unitSystem === "metric" ? t("unit.kmh") : t("unit.mph");
    return `${this.number(value, 0)} ${unit}`;
  },

  distance(km: number | undefined, settings: Settings): string {
    if (km == null) return unavailable();
    if (settings.unitSystem === "metric") return `${this.number(km, 1)} km`;
    return `${this.number(km * 0.621371, 1)} mi`;
  },

  /** Odometer and service intervals are whole numbers — a tenth of a kilometre
   * is noise next to a six-figure reading. */
  odometer(km: number | undefined, settings: Settings): string {
    if (km == null) return unavailable();
    if (settings.unitSystem === "metric") return `${this.number(km, 0)} km`;
    return `${this.number(km * 0.621371, 0)} mi`;
  },

  temperature(celsius: number | undefined, settings: Settings): string {
    if (celsius == null) return unavailable();
    if (settings.temperatureUnit === "celsius") return `${this.number(celsius, 0)} ${t("unit.celsius")}`;
    const f = (celsius * 9) / 5 + 32;
    return `${this.number(f, 0)} ${t("unit.fahrenheit")}`;
  },

  rpm(value: number | undefined): string {
    if (value == null) return unavailable();
    return `${this.number(value, 0)} ${t("unit.rpm")}`;
  },

  percent(value: number | undefined): string {
    if (value == null) return unavailable();
    return `${this.number(value, 0)}${t("unit.percent")}`;
  },

  voltage(value: number | undefined): string {
    if (value == null) return unavailable();
    return `${this.number(value, 1)} ${t("unit.volt")}`;
  },

  boost(bar: number | undefined, settings: Settings): string {
    if (bar == null) return unavailable();
    switch (settings.pressureUnit) {
      case "bar": {
        const sign = bar >= 0 ? "+" : "";
        return `${sign}${this.number(bar, 2)} bar`;
      }
      case "kpa":
        return `${this.number(bar * 100, 0)} kPa`;
      case "psi":
        return `${this.number(bar * 100 * 0.145038, 1)} psi`;
    }
  },

  liters(value: number | undefined): string {
    if (value == null) return unavailable();
    return `${this.number(value, 2)} ${t("unit.liter")}`;
  },

  /** Convert L/100km to display string per settings. */
  consumption(l100km: number | undefined, settings: Settings, idleLh?: number, speedKmh?: number): string {
    if (speedKmh != null && speedKmh <= 3 && idleLh != null) {
      return `${this.number(idleLh, 1)} ${t("unit.literPerHour")}`;
    }
    if (l100km == null || l100km < 0.5 || l100km > 60) return unavailable();
    let value: number;
    let unitKey: string;
    switch (settings.consumptionUnit) {
      case "l100km":
        value = l100km;
        unitKey = "unit.l100km";
        break;
      case "kmPerL":
        value = 100 / l100km;
        unitKey = "unit.kmPerL";
        break;
      case "mpgUS":
        value = 235.215 / l100km;
        unitKey = "unit.mpgUS";
        break;
      case "mpgUK":
        value = 282.481 / l100km;
        unitKey = "unit.mpgUK";
        break;
    }
    return `${this.number(value, 1)} ${t(unitKey)}`;
  },

  duration(seconds: number): string {
    if (seconds < 3600) {
      const mins = Math.max(0, Math.round(seconds / 60));
      return `${mins}m`;
    }
    const hours = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  },

  liveDuration: MetricFormatter.liveDuration,

  currency(amount: number, code: string): string {
    try {
      return new Intl.NumberFormat(i18n.language, { style: "currency", currency: code }).format(amount);
    } catch {
      return `${formatNumber(amount, 2)} ${code}`;
    }
  },

  truncate(text: string, max: number): string {
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
  },
};
