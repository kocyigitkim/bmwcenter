# BMWCenter — Current SwiftData Data Model (Phase 0 Audit)

**Status:** Snapshot as of 2026-08-07, before any Phase 1+ refactoring. Read-only description of what exists — not a redesign proposal.

All paths are relative to the repo root. Source of truth: `BMWCenter/Core/Storage/Models.swift` (599 lines), `StorageStack.swift`, `Migrations.swift`, `TripRepository.swift`, `FuelRepository.swift`.

There are **18** `@Model` classes registered in the schema (the earlier project-status note said 19 — `DrivingEvent` exists in the schema and as a `Trip` relationship, but no code path in the app currently constructs/inserts a `DrivingEvent`; see below).

## Summary Table

| Model | Purpose | Key relationships |
|---|---|---|
| `Trip` | One recorded (or manual) drive: distance/time/fuel/score summary | 1‑to‑many → `TripSample` (cascade), 1‑to‑many → `DrivingEvent` (cascade); referenced by `ProtectionEvent.trip` (optional, no delete rule) |
| `TripSample` | Per-second telemetry point during a trip (speed, rpm, fuel rate, coolant, throttle, boost) | many‑to‑1 → `Trip` (inverse of `Trip.samples`) |
| `DrivingEvent` | Detected driving event (harsh accel/brake, etc.) tied to a trip | many‑to‑1 → `Trip` (inverse of `Trip.events`); **currently never instantiated anywhere in the app** |
| `RefuelEntry` | User-logged fuel fill-up | none (standalone) |
| `FuelPricePoint` | Historical fuel price sample, one auto-created per refuel | none (standalone) |
| `CalibrationSample` | Result of comparing a measured tank refill vs. calculated consumption, used to derive `fuelCalibrationFactor` | none (standalone) |
| `VehicleProfile` | Vehicle configuration/calibration singleton-ish record (one `isActive` row expected) | none (standalone) |
| `MaintenanceItem` | User-configured maintenance reminder (interval by km/months) | none (standalone) |
| `DTCRecord` | OBD diagnostic trouble code occurrence | none (standalone) |
| `CrankRecord` | Engine-crank battery voltage sample | none (standalone) |
| `AccelRecord` | 0–100/0–60/80–120 acceleration test result | none (standalone); **no readers found** |
| `BaselineMetric` | Running statistical baseline (mean/variance/percentiles) for a driving metric, keyed by `key`/`bucketKey` | none (standalone) |
| `ProtectionEvent` | Logged "Care" protection/guardian event (overheat, cold-start, battery, thermal shock, fuel trim) | many‑to‑1 → `Trip` (optional `trip` property, no `@Relationship` inverse declared); **no readers found** |
| `ChallengeProgress` | Weekly gamification challenge progress | none (standalone) |
| `BadgeAward` | Earned gamification badge | none (standalone) |
| `StreakState` | Single running streak/points state (shields, current/best days) | none (standalone) |
| `MaintenanceLedger` | Adaptive/severity-weighted maintenance mileage ledger per item key | none (standalone) |
| `ThermalEvent` | Thermal-load-index event with recommended vs. actual idle time | none (standalone); **no readers found** |

---

## `Trip`
`Models.swift:8-74`

- `id: UUID`, `startedAt: Date`, `endedAt: Date?`
- `distanceKm`, `durationS`, `movingDurationS`, `idleDurationS`, `fuelUsedL`, `idleFuelL`, `avgSpeedKmh`, `maxSpeedKmh`, `maxRpm`, `avgL100: Double`
- `startFuelPct`, `endFuelPct: Double?`
- `startLatitude/Longitude`, `endLatitude/Longitude: Double?`, `startPlaceName/endPlaceName: String?`
- `routeData: Data?` (unspecified encoding, no `.externalStorage` attribute)
- `isManual: Bool`, `categoryRaw: String` (backing computed enum `category: TripCategory` — `personal/business/other`), `dataSource: String` (e.g. `"obd"`)
- `scoreTotal: Double?`, `scoreBreakdownData: Data?` (JSON-encoded score breakdown)
- `note: String?`
- `@Relationship(deleteRule: .cascade, inverse: \TripSample.trip) var samples: [TripSample]?`
- `@Relationship(deleteRule: .cascade, inverse: \DrivingEvent.trip) var events: [DrivingEvent]?`

**No `@Attribute` unique constraints anywhere in `Models.swift`.**

- **Writer:** `Core/Trip/TripRecorder.swift` — `beginTrip()` constructs and inserts a `Trip` when recording starts; `finalizeTrip()` mutates the same instance in place (sets `endedAt`, aggregates, `scoreTotal`, `scoreBreakdownData`) and saves, or deletes it if the trip is discarded (distance < 0.3 km and duration < 60s).
- **Readers:** `TripRepository` (`trips(in:)`, `todayTrips()/weekTrips()/monthTrips()`, `recentTrips(limit:)`, `scoreTrend(days:)`, `trip(id:)`) — all `FetchDescriptor<Trip>`. UI: `Phone/Trips/TripListView.swift` via `@Query(sort: \Trip.startedAt, order: .reverse)`. Also read (via relationship) inside `CareCoordinator.swift`, `ChallengeEngine.swift`, `TripMapView.swift`.
- `DrivingSummary` (a plain `struct`, not `@Model`) is derived in-memory from arrays of `Trip` (`Models.swift:558-599`) for dashboard aggregation.

## `TripSample`
`Models.swift:76-104`

- `t: Date`, `speedKmh`, `rpm`, `fuelRateLh`, `coolantC`, `throttlePct`, `boostKpa: Double`
- `trip: Trip?` (inverse side of `Trip.samples`)

- **Writer:** `TripRecorder.sample(snapshot:now:)` buffers one `TripSample` per second into an in-memory array (`memorySamples`), then `flushSamples()` sets `sample.trip = trip` and calls `modelContext.insert(sample)`, flushed periodically during recording and again at `finalizeTrip`.
- **Reader:** No `FetchDescriptor<TripSample>` found anywhere; samples are only ever accessed via the `trip.samples` relationship (e.g. `TripSummaryCardRenderer.swift`).
- **Retention:** No pruning/downsampling logic exists. Samples are written at 1 Hz for the full duration of every non-discarded trip and are kept indefinitely; only cascade-deleted if the parent `Trip` is deleted.

## `DrivingEvent`
`Models.swift:106-134`

- `typeRaw: String`, `t: Date`, `severityRaw: String`, `speedKmh`, `magnitude: Double`, `latitude/longitude: Double?`
- `trip: Trip?` (inverse side of `Trip.events`)

- **Writer:** none found. Grepping the whole tree for `DrivingEvent(` finds only the model's own `init` — no service constructs a `DrivingEvent` and inserts it.
- **Effective behavior:** `Trip.events` is always `nil`/empty in practice. Event *detection* does happen at runtime via `Core/Analysis/EventDetector.swift`, which produces a separate, non-persisted `DetectedEvent` struct; `TripRecorder.finalizeTrip()` maps `(trip.events ?? [])` back into `DetectedEvent` for scoring — since `trip.events` is never populated, this mapping currently always yields an empty array at trip-finalize time. `CareCoordinator.swift` and `ChallengeEngine.swift` also filter `trip.events ?? []` for harsh-brake/accel counts, which will likewise always be empty today.
- Registered in schema (`StorageStack.swift`) and used by `TripRepository.deleteAll()`, but is effectively dead/unpopulated data at present. **Worth flagging for Phase 1+ as either a bug to fix (wire up the writer) or dead schema to remove.**

## `RefuelEntry`
`Models.swift:136-168`

- `id: UUID`, `date: Date`, `liters`, `pricePerLiter`, `totalCost: Double` (computed at init as `liters * pricePerLiter`, not recomputed if `liters`/`pricePerLiter` mutate later), `odometerKm: Double?`, `isFullTank: Bool`, `stationName: String?`, `note: String?`

- **Writer:** `Phone/Fuel/AddRefuelSheet.swift` constructs it; `FuelRepository.addRefuel(_:)` inserts it and simultaneously creates a companion `FuelPricePoint`.
- **Readers:** `FuelRepository.refuels(in:)`, `.allRefuels()`, `.lastFullTankPair()` (used for measured-consumption calibration), UI `@Query` in `Phone/Fuel/FuelView.swift`.
- **Deletion:** included in `TripRepository.deleteAll()`.

## `FuelPricePoint`
`Models.swift:170-181`

- `date: Date`, `pricePerLiter: Double`, `currencyCode: String` (default `"TRY"`, hardcoded on write too)

- **Writer:** only `FuelRepository.addRefuel(_:)` — one point auto-created per refuel entry; no standalone price-tracking UI found.
- **Reader:** `FuelRepository.priceHistory(days:)`.
- **Deletion:** included in `TripRepository.deleteAll()`.

## `CalibrationSample`
`Models.swift:183-207`

- `date: Date`, `measuredL`, `calculatedL`, `distanceKm`, `rawFactor: Double`, `accepted: Bool`

- **Writer:** `Core/Fuel/FuelCalibrator.swift`.
- **Reader:** `FuelRepository.calibrationSamples()`.
- **Deletion:** included in `TripRepository.deleteAll()`.

## `VehicleProfile`
`Models.swift:209-259`

- `id: UUID`, `name: String`, `fuelTypeRaw: String` (computed `fuelType: FuelType`, enum in `Core/Settings/UnitSystem.swift`), `tankCapacityL`, `displacementL`, `volumetricEfficiency: Double`, `isTurbo: Bool`, `fuelCalibrationFactor`, `speedCalibrationFactor: Double`, `odometerKm`, `odometerOffsetKm: Double`, `vin: String?`, `isActive: Bool`

- **Writer/seeding:** `Migrations.ensureActiveVehicleProfile(context:)` inserts a default `VehicleProfile()` at first launch (or whenever no `isActive == true` row exists) — no other insert site found, so today there is effectively a single "active" profile record per install with no UI to create additional vehicle profiles (matches the PRD's future "Garage" multi-vehicle concept not existing yet).
- **Reader:** `MaintenanceService.swift` (fetches `isActive` profile for odometer/interval math).
- **Not included** in `TripRepository.deleteAll()` — survives a "delete all data" operation.

## `MaintenanceItem`
`Models.swift:261-297`

- `id: UUID`, `titleKey: String`, `customTitle: String?`, `intervalKm: Double?`, `intervalMonths: Int?`, `lastDoneKm: Double?`, `lastDoneDate: Date?`, `lastCost: Double?`, `note: String?`, `isEnabled: Bool`

- **Writer/seeding:** `Migrations.seedMaintenanceIfNeeded(context:)` inserts `MaintenanceTemplates.defaults()` once, gated by a `UserDefaults` flag `migrations.maintenanceSeeded` (not a SwiftData schema-version mechanism). User-added items via `Phone/Maintenance/AddReminderSheet.swift`; also inserted by `MaintenanceService.swift` (presumably a re-seed/repair path).
- **Readers:** `MaintenanceService.swift` (multiple `FetchDescriptor<MaintenanceItem>` calls), UI `@Query` in `Phone/Maintenance/MaintenanceListView.swift`.
- **Not included** in `TripRepository.deleteAll()`.

## `DTCRecord`
`Models.swift:299-320`

- `code: String`, `seenAt: Date`, `clearedAt: Date?`, `statusRaw: String` (default `"stored"`), `freezeFrameData: Data?`

- **Writer:** `Core/OBD/DTCMonitor.swift` (open-code detection loop uses a `FetchDescriptor<DTCRecord>` to find already-known open codes, then inserts new ones and separately queries to mark cleared codes).
- **Reader:** UI `@Query(filter: #Predicate<DTCRecord> { $0.clearedAt == nil }, ...)` in `Phone/Diagnostics/DTCListView.swift`.
- **Deletion:** included in `TripRepository.deleteAll()`.

## `CrankRecord`
`Models.swift:322-343`

- `date: Date`, `minVoltage`, `restingVoltage`, `recoveryVoltage: Double`, `ambientC: Double?`

- **Writer/reader:** `Core/Care/BatteryGuardian.swift` (both inserts and fetches).
- **Reader (UI):** `@Query(sort: \CrankRecord.date, order: .reverse)` in `Phone/Diagnostics/BatteryHealthView.swift`.
- **Deletion:** included in `TripRepository.deleteAll()`.

## `AccelRecord`
`Models.swift:345-366`

- `date: Date`, `t0to100`, `t0to60`, `t80to120: Double?`, `sampleRateHz: Double`

- **Writer:** `Phone/Insights/AccelTestView.swift` (user-triggered acceleration test).
- **Reader:** none found (`FetchDescriptor<AccelRecord>`/`@Query` absent) — the view that writes records does not appear to read them back for history display; only referenced elsewhere by `TripRepository.deleteAll()`.

## `BaselineMetric`
`Models.swift:368-404`

- `key: String`, `bucketKey: String`, `count: Int`, `mean`, `m2` (Welford's-algorithm running variance accumulator), `p50`, `p95: Double`, `lastUpdated: Date`, `isMature: Bool`, `histogramData: Data?`

- **Writer/reader:** `Core/Care/BaselineLearner.swift` — fetches all `BaselineMetric` rows to update/read per-metric baselines used by the "Care" guardian services (`OverheatWatchdog`, `FuelTrimMonitor`, `ThermostatWatch` all take a `baseline: BaselineLearner`).
- **Not included** in `TripRepository.deleteAll()`.

## `ProtectionEvent`
`Models.swift:406-439`

- `id: UUID`, `typeRaw`, `severityRaw: String`, `t: Date`, `value`, `thresholdUsed: Double`, `contextData: Data?`, `acknowledged: Bool`, `trip: Trip?` (plain optional reference, **no `@Relationship`/inverse declared** on either side, unlike `TripSample`/`DrivingEvent`)

- **Writers:** `Core/Care/FuelTrimMonitor.swift`, `OverheatWatchdog.swift`, `ThermostatWatch.swift`, `ThermalShockGuard.swift`, `BatteryGuardian.swift`, `ColdEngineShield.swift` — all "Care" guardian services log protection events when a threshold trips.
- **Reader:** none found anywhere (no `FetchDescriptor<ProtectionEvent>`/`@Query`). Data is write-only today — no UI surfaces a protection-event history/log. **Worth flagging: this is exactly the kind of audit trail the PRD's health-history/explainability features (§29, §199) would want to read.**
- **Not included** in `TripRepository.deleteAll()`.

## `ChallengeProgress`
`Models.swift:441-471`

- `id: UUID`, `challengeKey: String`, `weekStart: Date`, `target`, `current: Double`, `difficultyRaw: String`, `points: Int`, `completedAt: Date?`

- **Writer/reader:** `Core/Care/ChallengeEngine.swift` (fetches all rows, inserts new weekly challenge).
- **Not included** in `TripRepository.deleteAll()`.

## `BadgeAward`
`Models.swift:473-484`

- `badgeKey: String`, `awardedAt: Date`, `progressSnapshot: Double`

- **Writer/reader:** `Core/Care/BadgeService.swift` (fetch, insert).
- **Not included** in `TripRepository.deleteAll()`.

## `StreakState`
`Models.swift:486-507`

- `currentDays`, `bestDays`, `shieldsAvailable: Int`, `lastGoodDay: Date?`, `totalPoints: Int`

- **Writer/reader:** `Core/Care/StreakService.swift` — fetches all rows and inserts a fresh `StreakState()` if none exists; effectively a single-row table, similar pattern to `VehicleProfile`, but with no `isActive`-style guard against duplicates — repeated calls before the first insert commits could theoretically create more than one row (not verified against actual call-timing).
- **Not included** in `TripRepository.deleteAll()`.

## `MaintenanceLedger`
`Models.swift:509-533`

- `itemKey: String`, `effectiveKm`, `actualKm: Double`, `lastDoneAt: Date?`, `lastDoneKm: Double?`, `severityAvg: Double`

- **Writer/reader:** `Core/Care/AdaptiveMaintenance.swift` — fetches all rows, inserts new ledger row; tracks a severity-adjusted "effective" mileage per maintenance item key, separate from the user-facing `MaintenanceItem.lastDoneKm`.
- **Not included** in `TripRepository.deleteAll()`.

## `ThermalEvent`
`Models.swift:535-556`

- `t: Date`, `tli: Double` (thermal load index), `recommendedIdleS`, `actualIdleS: Double`, `compliant: Bool`

- **Writer:** `Core/Care/ThermalShockGuard.swift`.
- **Reader:** none found — write-only, same situation as `ProtectionEvent`/`AccelRecord`.
- **Not included** in `TripRepository.deleteAll()`.

---

## `StorageStack.swift` — Container/Schema Setup

- `StorageStack.makeContainer()` builds a single `Schema([...])` listing all 18 `@Model` types explicitly (no `VersionedSchema`/`SchemaMigrationPlan` involved).
- `ModelConfiguration(isStoredInMemoryOnly: false)` — **persistent, on-device store**, default location (no explicit URL, no App Group container identifier, no CloudKit database configuration passed to `ModelConfiguration`). There is no sync/CloudKit entitlement wiring visible in this file.
- On success, it immediately runs `Migrations.runIfNeeded(context: ModelContext(container))` synchronously before returning the container.
- **Fallback path:** if `ModelContainer(for:configurations:)` throws, it logs the error and falls back to an **in-memory** `ModelConfiguration` via `try!` (force-try) — meaning a persistent-store failure (e.g. a genuinely breaking migration) currently degrades silently to a non-persistent store for that session rather than surfacing an error to the user or attempting recovery/data migration.

## `Migrations.swift` — Current Migration Strategy

There is **no real SwiftData migration system** in place today — no `VersionedSchema` types, no `SchemaMigrationPlan`, no `Schema.Version`. `Migrations.runIfNeeded(context:)` does exactly two things, both idempotent, UserDefaults-gated bootstrapping tasks rather than schema migrations:

1. `seedMaintenanceIfNeeded(context:)` — inserts default `MaintenanceItem` templates once, gated on a boolean `UserDefaults` key `"migrations.maintenanceSeeded"`.
2. `ensureActiveVehicleProfile(context:)` — fetches `VehicleProfile` where `isActive == true`; if none exists, inserts a default `VehicleProfile()`.

There is no lightweight/heavyweight migration handling for schema changes (added/removed/renamed properties) — SwiftData's automatic lightweight migration is presumably relied on implicitly whenever `Schema` changes, since `ModelConfiguration` is created fresh from the current `Schema` each launch with no versioning metadata. If a future schema change is not automatically migratable, `StorageStack.makeContainer()`'s only recourse is the in-memory fallback described above (i.e., silent data loss for that session, not a guided migration).

## Versioning Strategy for Derived/Computed Data

**None exists today.** There is no field anywhere in `Models.swift` resembling `baselineAlgorithmVersion`, `healthScoreVersion`, or any other schema/algorithm-version tag. Derived data such as `Trip.scoreTotal`/`scoreBreakdownData` (from `DrivingScorer`), `BaselineMetric` rows (from `BaselineLearner`), and `MaintenanceLedger.effectiveKm` (from `AdaptiveMaintenance`) are all stored without any indication of which algorithm version produced them. If the scoring/baseline/adaptive-maintenance logic changes in the future, there is currently no stored signal to distinguish old vs. new derived values, nor any recomputation/backfill mechanism. (This is the gap the PRD's §126 "Data Versioning" section calls out directly.)

## Data Retention / Pruning

**None exists.**

- `TripSample`: written once per second for the full duration of every recorded (non-discarded) trip via `TripRecorder.flushSamples()`, and kept forever; the only removal path is cascade-delete when the parent `Trip` is deleted.
- `DrivingEvent`: schema/relationship exists with `.cascade` delete rule but, as noted above, is never populated, so there is nothing to prune in practice.
- All other high-volume/log-like models (`ProtectionEvent`, `ThermalEvent`, `DTCRecord`, `CrankRecord`, `AccelRecord`, `CalibrationSample`, `FuelPricePoint`) are append-only with no age-based cleanup found.
- `TripRepository.deleteAll()` is the only bulk-removal path in the app, and it is a manual "wipe my data" operation (not automatic retention), clearing `Trip`, `RefuelEntry`, `DTCRecord`, `DrivingEvent`, `CalibrationSample`, `FuelPricePoint`, `CrankRecord`, `AccelRecord` — it does **not** clear `TripSample` directly (relies on `Trip`'s cascade rule), and it does **not** touch `VehicleProfile`, `MaintenanceItem`, `BaselineMetric`, `ProtectionEvent`, `ChallengeProgress`, `BadgeAward`, `StreakState`, `MaintenanceLedger`, or `ThermalEvent` — those persist even after a user-initiated "delete all data."

## Notable items for future phases (observations only, no action taken)

- `DrivingEvent` is dead schema today (never written) despite `Trip` having a cascade relationship to it and three call sites reading `trip.events ?? []` expecting it to eventually be populated.
- `ProtectionEvent` and `ThermalEvent` are write-only — no UI or service reads them back, despite being exactly the kind of "Care" audit trail the PRD's explainable-health features would want.
- No retention/downsampling strategy exists for `TripSample`, which the PRD (§124-125) explicitly flags as a future requirement once trip history grows large.
- No algorithm-version tagging exists on any derived/computed field, which the PRD (§126) flags as needed before baseline/scoring algorithms can safely evolve.
