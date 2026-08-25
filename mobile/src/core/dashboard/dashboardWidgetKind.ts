export type DashboardWidgetKind =
  | "speed"
  | "rpm"
  | "coolant"
  | "oilTemp"
  | "engineLoad"
  | "throttle"
  | "pedal"
  | "ignitionAdvance"
  | "catalyst"
  | "instantConsumption"
  | "fuelLevel"
  | "range"
  | "stft"
  | "ltft"
  | "maf"
  | "map"
  | "iat"
  | "fuelRail"
  | "lowPressureFuel"
  | "ecoScore"
  | "boost"
  | "boostSetpoint"
  | "intercooler"
  | "radiatorOutlet"
  | "ambient"
  | "transmissionOilTemp"
  | "voltage"
  | "batterySoc"
  | "alternatorVoltage"
  | "vanosIntake"
  | "vanosExhaust"
  | "oilPressure"
  | "vehicleScan"
  | "parking"
  | "dailyFuel";

export const ALL_WIDGET_KINDS: DashboardWidgetKind[] = [
  "speed",
  "rpm",
  "coolant",
  "oilTemp",
  "engineLoad",
  "throttle",
  "pedal",
  "ignitionAdvance",
  "catalyst",
  "instantConsumption",
  "fuelLevel",
  "range",
  "stft",
  "ltft",
  "maf",
  "map",
  "iat",
  "fuelRail",
  "lowPressureFuel",
  "ecoScore",
  "boost",
  "boostSetpoint",
  "intercooler",
  "radiatorOutlet",
  "ambient",
  "transmissionOilTemp",
  "voltage",
  "batterySoc",
  "alternatorVoltage",
  "vanosIntake",
  "vanosExhaust",
  "oilPressure",
  "vehicleScan",
  "parking",
  "dailyFuel",
];

/** IDs that must never appear in a persisted layout (pinned chrome). */
export const RESERVED_PINNED_CHROME_IDS = new Set([
  "connection",
  "connectionPill",
  "alerts",
  "alertChipRow",
  "care",
  "careChips",
  "trip",
  "activeTrip",
  "tripStrip",
]);

export const titleKey: Record<DashboardWidgetKind, string> = {
  speed: "metric.speed",
  rpm: "metric.rpm",
  coolant: "metric.coolant",
  oilTemp: "metric.oilTemp",
  engineLoad: "metric.engineLoad",
  throttle: "metric.throttle",
  pedal: "metric.pedal",
  ignitionAdvance: "metric.ignitionAdvance",
  catalyst: "metric.catalyst",
  instantConsumption: "metric.instant",
  fuelLevel: "metric.fuelLevel",
  range: "metric.range",
  stft: "metric.fuelTrimShort",
  ltft: "metric.fuelTrimLong",
  maf: "metric.maf",
  map: "metric.map",
  iat: "metric.intakeAir",
  fuelRail: "metric.fuelRail",
  lowPressureFuel: "metric.lowPressureFuel",
  ecoScore: "metric.ecoScore",
  boost: "metric.boost",
  boostSetpoint: "metric.boostSetpoint",
  intercooler: "metric.intercooler",
  radiatorOutlet: "metric.radiatorOutlet",
  ambient: "metric.ambient",
  transmissionOilTemp: "metric.transmissionOilTemp",
  voltage: "metric.voltage",
  batterySoc: "metric.batterySoc",
  alternatorVoltage: "metric.alternatorVoltage",
  vanosIntake: "metric.vanosIntake",
  vanosExhaust: "metric.vanosExhaust",
  oilPressure: "metric.oilPressure",
  vehicleScan: "scan.action",
  parking: "parking.findCar",
  dailyFuel: "dashboard.dailyFuel.title",
};

export const icon: Record<DashboardWidgetKind, string> = {
  speed: "speedometer",
  rpm: "engine",
  coolant: "thermometer",
  oilTemp: "oil",
  engineLoad: "engine",
  throttle: "gas-station",
  pedal: "car-brake-alert",
  ignitionAdvance: "fire",
  catalyst: "fire",
  instantConsumption: "water",
  fuelLevel: "gas-station",
  range: "road-variant",
  stft: "pulse",
  ltft: "pulse",
  maf: "weather-windy",
  map: "gauge",
  iat: "thermometer-low",
  fuelRail: "water-circle",
  lowPressureFuel: "water-alert",
  ecoScore: "leaf",
  boost: "weather-windy",
  boostSetpoint: "target",
  intercooler: "snowflake",
  radiatorOutlet: "thermometer",
  ambient: "weather-sunny",
  transmissionOilTemp: "cog",
  voltage: "car-battery",
  batterySoc: "battery-high",
  alternatorVoltage: "car-electric",
  vanosIntake: "sync",
  vanosExhaust: "sync",
  oilPressure: "gauge",
  vehicleScan: "stethoscope",
  parking: "map-marker",
  dailyFuel: "gas-station",
};

export type DashboardWidgetCategory = "engine" | "fuel" | "extended" | "electrical" | "actions";

export const galleryCategory: Record<DashboardWidgetKind, DashboardWidgetCategory> = {
  speed: "engine",
  rpm: "engine",
  coolant: "engine",
  oilTemp: "engine",
  engineLoad: "engine",
  throttle: "engine",
  pedal: "engine",
  ignitionAdvance: "engine",
  catalyst: "engine",
  oilPressure: "engine",
  instantConsumption: "fuel",
  fuelLevel: "fuel",
  range: "fuel",
  stft: "fuel",
  ltft: "fuel",
  maf: "fuel",
  map: "fuel",
  iat: "fuel",
  fuelRail: "fuel",
  lowPressureFuel: "fuel",
  ecoScore: "fuel",
  boost: "extended",
  boostSetpoint: "extended",
  intercooler: "extended",
  radiatorOutlet: "extended",
  ambient: "extended",
  transmissionOilTemp: "extended",
  vanosIntake: "extended",
  vanosExhaust: "extended",
  voltage: "electrical",
  batterySoc: "electrical",
  alternatorVoltage: "electrical",
  vehicleScan: "actions",
  parking: "actions",
  dailyFuel: "fuel",
};

/** OEM / Mode-22 sensors. Never included in the Daily factory layout. */
export const EXTENDED_OEM: Set<DashboardWidgetKind> = new Set([
  "fuelRail",
  "lowPressureFuel",
  "boost",
  "boostSetpoint",
  "vanosIntake",
  "vanosExhaust",
  "transmissionOilTemp",
  "oilPressure",
  "radiatorOutlet",
  "intercooler",
  "alternatorVoltage",
  "batterySoc",
]);

export type DashboardWidgetSize = "small" | "hero";

const HERO_DEFAULT: Set<DashboardWidgetKind> = new Set([
  "speed",
  "rpm",
  "vehicleScan",
  "parking",
  "instantConsumption",
  "dailyFuel",
]);

export function defaultSize(kind: DashboardWidgetKind): DashboardWidgetSize {
  return HERO_DEFAULT.has(kind) ? "hero" : "small";
}

/** Two consecutive hero gauges with this flag share one dual GaugeRing row. */
const PAIRABLE_HERO: Set<DashboardWidgetKind> = new Set([
  "speed",
  "rpm",
  "coolant",
  "oilTemp",
  "boost",
  "voltage",
  "engineLoad",
  "transmissionOilTemp",
]);

export function isPairableHero(kind: DashboardWidgetKind): boolean {
  return PAIRABLE_HERO.has(kind);
}

const ALWAYS_GAUGE: Set<DashboardWidgetKind> = new Set(["speed", "rpm"]);
export function alwaysRendersGauge(kind: DashboardWidgetKind): boolean {
  return ALWAYS_GAUGE.has(kind);
}

const GAUGE_WHEN_HERO: Set<DashboardWidgetKind> = new Set([
  "speed",
  "rpm",
  "coolant",
  "oilTemp",
  "boost",
  "voltage",
  "engineLoad",
  "transmissionOilTemp",
  "fuelRail",
]);
export function rendersGaugeWhenHero(kind: DashboardWidgetKind): boolean {
  return GAUGE_WHEN_HERO.has(kind);
}

const ACTION_CARDS: Set<DashboardWidgetKind> = new Set(["vehicleScan", "parking", "dailyFuel"]);
export function isActionCard(kind: DashboardWidgetKind): boolean {
  return ACTION_CARDS.has(kind);
}
