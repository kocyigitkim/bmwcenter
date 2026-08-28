/**
 * Which dashboard widgets can be opened into a graph, and in what units.
 *
 * Only widgets backed by a single numeric PID appear here. Derived cards
 * (range, instant consumption, eco score) are computed from several readings
 * and are not stored in the history, so tapping them does nothing rather than
 * opening an empty chart.
 */

import * as DM from "../dashboard/dashMetrics";
import type { DashboardWidgetKind } from "../dashboard/dashboardWidgetKind";
import type { AppSettingsState } from "../settings/appSettings";
import type { MetricKey } from "./metricHistory";

type Settings = AppSettingsState;

export interface GraphableMetric {
  key: MetricKey;
  /** Resolved against settings so the graph follows the user's unit choices. */
  unitKey: (settings: Settings) => string;
  precision: number;
  /** Converts the stored SI-ish reading into display units. */
  convert: (raw: number, settings: Settings) => number;
}

const identity = (raw: number) => raw;
const fixedUnit = (key: string) => () => key;

function plain(key: MetricKey, unit: string, precision: number): GraphableMetric {
  return { key, unitKey: fixedUnit(unit), precision, convert: identity };
}

function temperature(key: MetricKey): GraphableMetric {
  return {
    key,
    unitKey: DM.tempUnitKey,
    precision: 0,
    convert: (raw, settings) => DM.displayTemp(raw, settings) ?? raw,
  };
}

const GRAPHABLE: Partial<Record<DashboardWidgetKind, GraphableMetric>> = {
  speed: {
    key: "speedKmh",
    unitKey: DM.speedUnitKey,
    precision: 0,
    convert: (raw, settings) => DM.displaySpeed(raw, settings) ?? raw,
  },
  rpm: plain("rpm", "unit.rpm", 0),
  coolant: temperature("coolantC"),
  oilTemp: temperature("oilTempC"),
  transmissionOilTemp: temperature("transmissionOilTempC"),
  intercooler: temperature("intercoolerC"),
  radiatorOutlet: temperature("radiatorOutletC"),
  ambient: temperature("ambientC"),
  iat: temperature("intakeAirC"),
  catalyst: temperature("catalystC"),
  engineLoad: plain("engineLoadPct", "unit.percent", 0),
  throttle: plain("throttlePct", "unit.percent", 0),
  pedal: plain("pedalPct", "unit.percent", 0),
  fuelLevel: plain("fuelLevelPct", "unit.percent", 0),
  batterySoc: plain("batterySocPct", "unit.percent", 0),
  voltage: plain("voltage", "unit.volt", 1),
  alternatorVoltage: plain("alternatorVoltage", "unit.volt", 1),
  maf: plain("mafGs", "unit.gramsPerSecond", 1),
  map: plain("mapKpa", "unit.kpa", 0),
  stft: plain("stftBank1", "unit.percent", 1),
  ltft: plain("ltftBank1", "unit.percent", 1),
  fuelRail: plain("fuelRailBar", "unit.bar", 0),
  lowPressureFuel: plain("lowPressureFuelBar", "unit.bar", 1),
  oilPressure: plain("oilPressureBar", "unit.bar", 1),
  boost: plain("boostActualKpa", "unit.kpa", 0),
  boostSetpoint: plain("boostSetpointKpa", "unit.kpa", 0),
  vanosIntake: plain("vanosIntakeDeg", "unit.degree", 1),
  vanosExhaust: plain("vanosExhaustDeg", "unit.degree", 1),
  ignitionAdvance: plain("timingAdvance", "unit.degree", 1),
};

export function graphableFor(kind: DashboardWidgetKind): GraphableMetric | undefined {
  return GRAPHABLE[kind];
}

export function isGraphable(kind: DashboardWidgetKind): boolean {
  return GRAPHABLE[kind] != null;
}

export const GRAPHABLE_KINDS = Object.keys(GRAPHABLE) as DashboardWidgetKind[];
