import * as SQLite from "expo-sqlite";
import { drizzle } from "drizzle-orm/expo-sqlite";
import * as schema from "./schema";

const sqlite = SQLite.openDatabaseSync("quickcar.db");

export const db = drizzle(sqlite, { schema });

/**
 * Hand-written DDL mirroring `schema.ts`. Kept as raw `CREATE TABLE IF NOT EXISTS`
 * statements (run once at startup) instead of drizzle-kit generated migrations, so
 * table creation doesn't depend on bundling a migrations folder through Metro —
 * table shape must be kept in sync with schema.ts by hand.
 */
export function bootstrapDatabase(): void {
  sqlite.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      distance_km REAL NOT NULL DEFAULT 0,
      duration_s REAL NOT NULL DEFAULT 0,
      moving_duration_s REAL NOT NULL DEFAULT 0,
      idle_duration_s REAL NOT NULL DEFAULT 0,
      fuel_used_l REAL NOT NULL DEFAULT 0,
      idle_fuel_l REAL NOT NULL DEFAULT 0,
      avg_speed_kmh REAL NOT NULL DEFAULT 0,
      max_speed_kmh REAL NOT NULL DEFAULT 0,
      max_rpm REAL NOT NULL DEFAULT 0,
      avg_l100 REAL NOT NULL DEFAULT 0,
      start_fuel_pct REAL,
      end_fuel_pct REAL,
      start_latitude REAL,
      start_longitude REAL,
      end_latitude REAL,
      end_longitude REAL,
      start_place_name TEXT,
      end_place_name TEXT,
      route_data TEXT,
      is_manual INTEGER NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'personal',
      data_source TEXT NOT NULL DEFAULT 'obd',
      score_total REAL,
      score_breakdown_json TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trips_started_at ON trips(started_at);

    CREATE TABLE IF NOT EXISTS trip_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      t INTEGER NOT NULL,
      speed_kmh REAL NOT NULL DEFAULT 0,
      rpm REAL NOT NULL DEFAULT 0,
      fuel_rate_lh REAL NOT NULL DEFAULT 0,
      coolant_c REAL NOT NULL DEFAULT 0,
      throttle_pct REAL NOT NULL DEFAULT 0,
      boost_kpa REAL NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_trip_samples_trip_id ON trip_samples(trip_id);

    CREATE TABLE IF NOT EXISTS driving_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT,
      type TEXT NOT NULL,
      t INTEGER NOT NULL,
      severity TEXT NOT NULL DEFAULT 'normal',
      speed_kmh REAL NOT NULL DEFAULT 0,
      magnitude REAL NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL
    );
    CREATE INDEX IF NOT EXISTS idx_driving_events_trip_id ON driving_events(trip_id);

    CREATE TABLE IF NOT EXISTS refuel_entries (
      id TEXT PRIMARY KEY NOT NULL,
      date INTEGER NOT NULL,
      liters REAL NOT NULL,
      price_per_liter REAL NOT NULL,
      total_cost REAL NOT NULL,
      odometer_km REAL,
      is_full_tank INTEGER NOT NULL DEFAULT 0,
      station_name TEXT,
      note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_refuel_entries_date ON refuel_entries(date);

    CREATE TABLE IF NOT EXISTS fuel_price_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      price_per_liter REAL NOT NULL,
      currency_code TEXT NOT NULL DEFAULT 'TRY'
    );
    CREATE INDEX IF NOT EXISTS idx_fuel_price_points_date ON fuel_price_points(date);

    CREATE TABLE IF NOT EXISTS calibration_samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      measured_l REAL NOT NULL,
      calculated_l REAL NOT NULL,
      distance_km REAL NOT NULL,
      raw_factor REAL NOT NULL,
      accepted INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_profiles (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT 'Vehicle',
      fuel_type TEXT NOT NULL DEFAULT 'gasoline',
      tank_capacity_l REAL NOT NULL DEFAULT 60,
      displacement_l REAL NOT NULL DEFAULT 2.0,
      volumetric_efficiency REAL NOT NULL DEFAULT 0.85,
      is_turbo INTEGER NOT NULL DEFAULT 1,
      fuel_calibration_factor REAL NOT NULL DEFAULT 1.0,
      speed_calibration_factor REAL NOT NULL DEFAULT 1.0,
      odometer_km REAL NOT NULL DEFAULT 0,
      odometer_offset_km REAL NOT NULL DEFAULT 0,
      vin TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS maintenance_items (
      id TEXT PRIMARY KEY NOT NULL,
      title_key TEXT NOT NULL,
      custom_title TEXT,
      interval_km REAL,
      interval_months INTEGER,
      last_done_km REAL,
      last_done_date INTEGER,
      last_cost REAL,
      note TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS dtc_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      seen_at INTEGER NOT NULL,
      cleared_at INTEGER,
      status TEXT NOT NULL DEFAULT 'stored',
      freeze_frame_json TEXT
    );

    CREATE TABLE IF NOT EXISTS crank_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      min_voltage REAL NOT NULL,
      resting_voltage REAL NOT NULL,
      recovery_voltage REAL NOT NULL,
      ambient_c REAL
    );

    CREATE TABLE IF NOT EXISTS accel_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      t0_to_100 REAL,
      t0_to_60 REAL,
      t80_to_120 REAL,
      sample_rate_hz REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS baseline_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL,
      bucket_key TEXT NOT NULL DEFAULT '',
      count INTEGER NOT NULL DEFAULT 0,
      mean REAL NOT NULL DEFAULT 0,
      m2 REAL NOT NULL DEFAULT 0,
      p50 REAL NOT NULL DEFAULT 0,
      p95 REAL NOT NULL DEFAULT 0,
      last_updated INTEGER NOT NULL,
      is_mature INTEGER NOT NULL DEFAULT 0,
      histogram_json TEXT
    );

    CREATE TABLE IF NOT EXISTS protection_events (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL,
      severity TEXT NOT NULL,
      t INTEGER NOT NULL,
      value REAL NOT NULL DEFAULT 0,
      threshold_used REAL NOT NULL DEFAULT 0,
      context_json TEXT,
      acknowledged INTEGER NOT NULL DEFAULT 0,
      trip_id TEXT
    );

    CREATE TABLE IF NOT EXISTS challenge_progress (
      id TEXT PRIMARY KEY NOT NULL,
      challenge_key TEXT NOT NULL,
      week_start INTEGER NOT NULL,
      target REAL NOT NULL,
      current REAL NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL,
      points INTEGER NOT NULL,
      completed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS badge_awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      badge_key TEXT NOT NULL,
      awarded_at INTEGER NOT NULL,
      progress_snapshot REAL NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS streak_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      current_days INTEGER NOT NULL DEFAULT 0,
      best_days INTEGER NOT NULL DEFAULT 0,
      shields_available INTEGER NOT NULL DEFAULT 1,
      last_good_day INTEGER,
      total_points INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS maintenance_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_key TEXT NOT NULL,
      effective_km REAL NOT NULL DEFAULT 0,
      actual_km REAL NOT NULL DEFAULT 0,
      last_done_at INTEGER,
      last_done_km REAL,
      severity_avg REAL NOT NULL DEFAULT 1.0
    );

    CREATE TABLE IF NOT EXISTS thermal_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      t INTEGER NOT NULL,
      tli REAL NOT NULL,
      recommended_idle_s REAL NOT NULL,
      actual_idle_s REAL NOT NULL DEFAULT 0,
      compliant INTEGER NOT NULL DEFAULT 0
    );
  `);
}

/**
 * Adds a column to an existing table when it isn't there yet.
 *
 * `CREATE TABLE IF NOT EXISTS` above never alters a table that already exists,
 * so an app upgraded from an older install keeps the old shape. SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, hence the PRAGMA check.
 */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = sqlite.getAllSync<{ name: string }>(`PRAGMA table_info(${table});`);
  if (columns.some((c) => c.name === column)) return;
  sqlite.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
}

/** Schema changes that must also reach databases created by earlier versions. */
export function migrateDatabase(): void {
  // Garage: rows recorded before multi-vehicle support have no owner. They stay
  // that way until the user describes a car and accepts the offer to adopt them.
  for (const table of ["trips", "refuel_entries", "dtc_records", "maintenance_items"]) {
    addColumnIfMissing(table, "vehicle_id", "TEXT");
  }
  addColumnIfMissing("vehicle_profiles", "is_seeded", "INTEGER NOT NULL DEFAULT 0");

  // Per-trip diagnostics. Nullable so a sensor the car never reported stays
  // distinguishable from one that genuinely read zero.
  for (const column of [
    "engine_load_pct",
    "voltage",
    "intake_air_c",
    "map_kpa",
    "maf_gs",
    "stft_pct",
    "ltft_pct",
    "oil_temp_c",
    "fuel_level_pct",
    "ambient_c",
  ]) {
    addColumnIfMissing("trip_samples", column, "REAL");
  }
  addColumnIfMissing("dtc_records", "trip_id", "TEXT");
  sqlite.execSync(`
    CREATE TABLE IF NOT EXISTS trip_diagnostic_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id TEXT NOT NULL,
      t INTEGER NOT NULL,
      kind TEXT NOT NULL,
      code TEXT,
      status TEXT,
      freeze_frame_json TEXT,
      context_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trip_diagnostic_events_trip_id
      ON trip_diagnostic_events(trip_id);
  `);
}
