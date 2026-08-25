import { sqliteTable, text, integer, real, blob } from "drizzle-orm/sqlite-core";

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at"),
  distanceKm: real("distance_km").notNull().default(0),
  durationS: real("duration_s").notNull().default(0),
  movingDurationS: real("moving_duration_s").notNull().default(0),
  idleDurationS: real("idle_duration_s").notNull().default(0),
  fuelUsedL: real("fuel_used_l").notNull().default(0),
  idleFuelL: real("idle_fuel_l").notNull().default(0),
  avgSpeedKmh: real("avg_speed_kmh").notNull().default(0),
  maxSpeedKmh: real("max_speed_kmh").notNull().default(0),
  maxRpm: real("max_rpm").notNull().default(0),
  avgL100: real("avg_l100").notNull().default(0),
  startFuelPct: real("start_fuel_pct"),
  endFuelPct: real("end_fuel_pct"),
  startLatitude: real("start_latitude"),
  startLongitude: real("start_longitude"),
  endLatitude: real("end_latitude"),
  endLongitude: real("end_longitude"),
  startPlaceName: text("start_place_name"),
  endPlaceName: text("end_place_name"),
  routeData: blob("route_data", { mode: "json" }).$type<Array<{ lat: number; lon: number; t: number }>>(),
  isManual: integer("is_manual", { mode: "boolean" }).notNull().default(false),
  category: text("category").notNull().default("personal"),
  dataSource: text("data_source").notNull().default("obd"),
  scoreTotal: real("score_total"),
  scoreBreakdownJSON: text("score_breakdown_json"),
  note: text("note"),
});

export const tripSamples = sqliteTable("trip_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: text("trip_id").notNull(),
  t: integer("t").notNull(),
  speedKmh: real("speed_kmh").notNull().default(0),
  rpm: real("rpm").notNull().default(0),
  fuelRateLh: real("fuel_rate_lh").notNull().default(0),
  coolantC: real("coolant_c").notNull().default(0),
  throttlePct: real("throttle_pct").notNull().default(0),
  boostKpa: real("boost_kpa").notNull().default(0),
});

export const drivingEvents = sqliteTable("driving_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: text("trip_id"),
  type: text("type").notNull(),
  t: integer("t").notNull(),
  severity: text("severity").notNull().default("normal"),
  speedKmh: real("speed_kmh").notNull().default(0),
  magnitude: real("magnitude").notNull().default(0),
  latitude: real("latitude"),
  longitude: real("longitude"),
});

export const refuelEntries = sqliteTable("refuel_entries", {
  id: text("id").primaryKey(),
  date: integer("date").notNull(),
  liters: real("liters").notNull(),
  pricePerLiter: real("price_per_liter").notNull(),
  totalCost: real("total_cost").notNull(),
  odometerKm: real("odometer_km"),
  isFullTank: integer("is_full_tank", { mode: "boolean" }).notNull().default(false),
  stationName: text("station_name"),
  note: text("note"),
});

export const fuelPricePoints = sqliteTable("fuel_price_points", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date").notNull(),
  pricePerLiter: real("price_per_liter").notNull(),
  currencyCode: text("currency_code").notNull().default("TRY"),
});

export const calibrationSamples = sqliteTable("calibration_samples", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date").notNull(),
  measuredL: real("measured_l").notNull(),
  calculatedL: real("calculated_l").notNull(),
  distanceKm: real("distance_km").notNull(),
  rawFactor: real("raw_factor").notNull(),
  accepted: integer("accepted", { mode: "boolean" }).notNull(),
});

export const vehicleProfiles = sqliteTable("vehicle_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().default("Vehicle"),
  fuelType: text("fuel_type").notNull().default("gasoline"),
  tankCapacityL: real("tank_capacity_l").notNull().default(60),
  displacementL: real("displacement_l").notNull().default(2.0),
  volumetricEfficiency: real("volumetric_efficiency").notNull().default(0.85),
  isTurbo: integer("is_turbo", { mode: "boolean" }).notNull().default(true),
  fuelCalibrationFactor: real("fuel_calibration_factor").notNull().default(1.0),
  speedCalibrationFactor: real("speed_calibration_factor").notNull().default(1.0),
  odometerKm: real("odometer_km").notNull().default(0),
  odometerOffsetKm: real("odometer_offset_km").notNull().default(0),
  vin: text("vin"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const maintenanceItems = sqliteTable("maintenance_items", {
  id: text("id").primaryKey(),
  titleKey: text("title_key").notNull(),
  customTitle: text("custom_title"),
  intervalKm: real("interval_km"),
  intervalMonths: integer("interval_months"),
  lastDoneKm: real("last_done_km"),
  lastDoneDate: integer("last_done_date"),
  lastCost: real("last_cost"),
  note: text("note"),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
});

export const dtcRecords = sqliteTable("dtc_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  seenAt: integer("seen_at").notNull(),
  clearedAt: integer("cleared_at"),
  status: text("status").notNull().default("stored"),
  freezeFrameJSON: text("freeze_frame_json"),
});

export const crankRecords = sqliteTable("crank_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date").notNull(),
  minVoltage: real("min_voltage").notNull(),
  restingVoltage: real("resting_voltage").notNull(),
  recoveryVoltage: real("recovery_voltage").notNull(),
  ambientC: real("ambient_c"),
});

export const accelRecords = sqliteTable("accel_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: integer("date").notNull(),
  t0to100: real("t0_to_100"),
  t0to60: real("t0_to_60"),
  t80to120: real("t80_to_120"),
  sampleRateHz: real("sample_rate_hz").notNull().default(0),
});

export const baselineMetrics = sqliteTable("baseline_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(),
  bucketKey: text("bucket_key").notNull().default(""),
  count: integer("count").notNull().default(0),
  mean: real("mean").notNull().default(0),
  m2: real("m2").notNull().default(0),
  p50: real("p50").notNull().default(0),
  p95: real("p95").notNull().default(0),
  lastUpdated: integer("last_updated").notNull(),
  isMature: integer("is_mature", { mode: "boolean" }).notNull().default(false),
  histogramJSON: text("histogram_json"),
});

export const protectionEvents = sqliteTable("protection_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  t: integer("t").notNull(),
  value: real("value").notNull().default(0),
  thresholdUsed: real("threshold_used").notNull().default(0),
  contextJSON: text("context_json"),
  acknowledged: integer("acknowledged", { mode: "boolean" }).notNull().default(false),
  tripId: text("trip_id"),
});

export const challengeProgress = sqliteTable("challenge_progress", {
  id: text("id").primaryKey(),
  challengeKey: text("challenge_key").notNull(),
  weekStart: integer("week_start").notNull(),
  target: real("target").notNull(),
  current: real("current").notNull().default(0),
  difficulty: text("difficulty").notNull(),
  points: integer("points").notNull(),
  completedAt: integer("completed_at"),
});

export const badgeAwards = sqliteTable("badge_awards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  badgeKey: text("badge_key").notNull(),
  awardedAt: integer("awarded_at").notNull(),
  progressSnapshot: real("progress_snapshot").notNull().default(1),
});

export const streakState = sqliteTable("streak_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentDays: integer("current_days").notNull().default(0),
  bestDays: integer("best_days").notNull().default(0),
  shieldsAvailable: integer("shields_available").notNull().default(1),
  lastGoodDay: integer("last_good_day"),
  totalPoints: integer("total_points").notNull().default(0),
});

export const maintenanceLedger = sqliteTable("maintenance_ledger", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemKey: text("item_key").notNull(),
  effectiveKm: real("effective_km").notNull().default(0),
  actualKm: real("actual_km").notNull().default(0),
  lastDoneAt: integer("last_done_at"),
  lastDoneKm: real("last_done_km"),
  severityAvg: real("severity_avg").notNull().default(1.0),
});

export const thermalEvents = sqliteTable("thermal_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  t: integer("t").notNull(),
  tli: real("tli").notNull(),
  recommendedIdleS: real("recommended_idle_s").notNull(),
  actualIdleS: real("actual_idle_s").notNull().default(0),
  compliant: integer("compliant", { mode: "boolean" }).notNull().default(false),
});
