/**
 * The sensor columns a trip records, and how to present each one.
 *
 * Ordered roughly by how often a driver wants them: what the car was doing,
 * then how hot it got, then the mixture. Units follow the user's settings so a
 * trip graph reads the same way the dashboard does.
 */

import * as DM from "../dashboard/dashMetrics";
import type { AppSettingsState } from "../settings/appSettings";

type Settings = AppSettingsState;

export interface TripSensor {
  /** Column on trip_samples. */
  key: string;
  /** i18n key, reusing the dashboard's metric names. */
  labelKey: string;
  unitKey: (settings: Settings) => string;
  precision: number;
  convert: (raw: number, settings: Settings) => number;
}

const identity = (raw: number) => raw;
const fixed = (key: string) => () => key;

function plain(key: string, labelKey: string, unit: string, precision: number): TripSensor {
  return { key, labelKey, unitKey: fixed(unit), precision, convert: identity };
}

function temperature(key: string, labelKey: string): TripSensor {
  return {
    key,
    labelKey,
    unitKey: DM.tempUnitKey,
    precision: 0,
    convert: (raw, settings) => DM.displayTemp(raw, settings) ?? raw,
  };
}

export const TRIP_SENSORS: TripSensor[] = [
  {
    key: "speedKmh",
    labelKey: "metric.speed",
    unitKey: DM.speedUnitKey,
    precision: 0,
    convert: (raw, settings) => DM.displaySpeed(raw, settings) ?? raw,
  },
  plain("rpm", "metric.rpm", "unit.rpm", 0),
  plain("engineLoadPct", "metric.engineLoad", "unit.percent", 0),
  plain("throttlePct", "metric.throttle", "unit.percent", 0),
  temperature("coolantC", "metric.coolant"),
  temperature("oilTempC", "metric.oilTemp"),
  temperature("intakeAirC", "metric.intakeAir"),
  temperature("ambientC", "metric.ambient"),
  plain("boostKpa", "metric.boost", "unit.kpa", 0),
  plain("mapKpa", "metric.map", "unit.kpa", 0),
  plain("mafGs", "metric.maf", "unit.gramsPerSecond", 1),
  plain("stftPct", "metric.fuelTrimShort", "unit.percent", 1),
  plain("ltftPct", "metric.fuelTrimLong", "unit.percent", 1),
  plain("voltage", "metric.voltage", "unit.volt", 1),
  plain("fuelLevelPct", "metric.fuelLevel", "unit.percent", 0),
  plain("fuelRateLh", "metric.instant", "unit.literPerHour", 1),
];

export const TRIP_SENSOR_KEYS = TRIP_SENSORS.map((s) => s.key);

export function tripSensor(key: string): TripSensor | undefined {
  return TRIP_SENSORS.find((s) => s.key === key);
}
