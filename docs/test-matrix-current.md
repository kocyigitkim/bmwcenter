# BMWCenter — Current Test Coverage (Phase 0 Audit)

**Status:** Snapshot as of 2026-08-07, before any Phase 1+ refactoring. Read-only description of what exists — not a plan for new tests (though gaps are noted at the end for later phases to address).

## Test Matrix Summary

| Test file | Class/module under test | # tests | Pass/Fail |
|---|---|---|---|
| BaselineLearnerTests.swift | `BaselineLearner` (Care), `CareBucket` | 2 | Pass |
| BatteryHealthTests.swift | `BatteryHealthAnalyzer` (Analysis) | 4 | Pass |
| CareFeatureTests.swift | `OilTempEstimator`, `EngineReadyService`, `ColdEngineShield`, `ThermalShockGuard`, `AdaptiveMaintenance`, `FuelTrimMonitor`, `GearCoach`, `OverheatWatchdog`, `BatteryGuardian` (Care) | 10 | Pass |
| CueSchedulerTests.swift | `CueScheduler`, `CueSeverity` (Care) | 5 | Pass |
| DTCDecodingTests.swift | `OBDFrameParser.parseDTCResponse`, `DTCCatalog.json` | 5 | Pass |
| DrivingScorerTests.swift | `DrivingScorer`, `ScoreBreakdown` (Analysis) | 4 | Pass |
| EventDetectorTests.swift | `EventDetector` (Analysis) | 4 | Pass |
| ExportTests.swift | `CSVExporter`, `GPXExporter` (Export) | 3 | Pass |
| FormatterTests.swift | `Formatters`, `TextBar`, `MetricFormatter` (Util) | 10 | Pass |
| FuelCalculatorTests.swift | `FuelCalculator`, `FuelIntegrationState`, `FuelType` (Fuel) | 10 | Pass |
| FuelCalibratorTests.swift | Fuel calibration acceptance/EMA/clamp logic (Fuel) | 4 | Pass |
| PIDParsingTests.swift | `OBDFrameParser`, `OBDPIDCatalog`, `VLinkerPIDCatalog` (OBD) | 28 | Pass |
| SpeedCalibratorTests.swift | `SpeedCalibrator` (Analysis) | 3 | Pass |
| TripRecorderTests.swift | `TripRecorder`, `TripRepository` (Trip/Storage) | 2 | Pass |
| VINDecoderTests.swift | `VINDecoder` (OBD) | 6 | Pass |
| **Total (BMWCenterTests)** | | **100** | **100/100 Pass** |
| SmokeTests.swift (UITests) | App launch / tab bar navigation | 1 | Not run in this pass (see below) |

## Per-file Notes

**BaselineLearnerTests.swift** — XCTest, `@testable import BMWCenter`, pure unit logic (no mocks/fixtures).
- `testWelfordMeanAndPercentiles`: feeds 200 random values through `BaselineLearner.updateOnline` (Welford's online mean/variance + histogram binning) and checks the running mean matches the true mean within tolerance, and that p50/p95 percentiles derived from histogram bins are sane and ordered correctly.
- `testAmbientBuckets`: checks `CareBucket.ambient(_:)` maps raw temperatures to the correct bucket label strings (`<0`, `10-20`, `>30`).

**BatteryHealthTests.swift** — XCTest, pure unit logic.
- `testClassifyThresholds`: verifies `BatteryHealthAnalyzer.classify` returns `.good`/`.fair`/`.weak` at specific min-voltage cutoffs.
- `testColdCorrectionIsLenient`: verifies a cold-ambient correction bumps a borderline voltage from `.fair` to `.good`.
- `testCrankDetectionOnRPMCross`: feeds a synthetic voltage-vs-time sample sequence around an RPM transition (0→800) and checks `detectCrank` finds the crank event and captures the correct minimum voltage.
- `testDecliningSlope`: builds a monotonically decreasing voltage series, checks `linearSlope` is negative beyond a threshold, and that `assess(history:)` flags `declining == true`.

**CareFeatureTests.swift** — XCTest, `@MainActor`, pure unit logic (constructs real Care structs/services directly, no mocks). 10 tests covering many small Care algorithms in one file:
- `testOilTempEstimatorAnchors`: oil-temp model anchors to coolant temp minus offset over a long simulated run.
- `testEngineReadyHysteresisFormula`: readiness score is low when cold, ≥0.98 when fully warmed with sustained load.
- `testColdCaps`: `ColdEngineShield.caps` returns RPM/load caps when oil is cold, `nil` caps once warm.
- `testTLIAndIdle`: `ThermalShockGuard.computeTLI` thermal-load-index rises with sustained samples; `recommendedIdle` maps TLI bands to idle-time recommendations (0/45/120s).
- `testSeverityFactorBounds`: `AdaptiveMaintenance.severityFactor` returns ~1.0 for a benign trip profile and is bounded (1.5, 2.4] for a harsh one.
- `testMaintenanceNeverExtends`: `AdaptiveMaintenance.remainingKm` takes the min of effective-vs-actual wear estimates (adaptive interval only shortens, never extends).
- `testTrimValidation`: `FuelTrimMonitor.validateAlert` requires minimum trip count, duration, and time-since-refuel before validating a fuel-trim alert.
- `testGearClustering`: `GearCoach.clusterRatios` k-means-style clustering of simulated gear-ratio samples recovers 6 ordered clusters.
- `testOverheatImmatureThresholds`: `OverheatWatchdog.thresholds` returns fixed watch/alarm/critical temps before baseline is "mature".
- `testBatteryRegressionRequiresR2`: `BatteryGuardian.linearRegression` fits a declining-voltage series and returns r² above a floor.

**CueSchedulerTests.swift** — XCTest, `@MainActor`. Uses a lightweight fixture: `AppSettings` backed by a per-test `UserDefaults(suiteName: UUID().uuidString)` (isolated defaults, not a full mock) plus a real `AudioAnnouncer`/`CueScheduler`.
- `testCriticalBypassesSameCueInterval`: critical-severity cues bypass the "same cue" debounce interval.
- `testCoachMinInterval`: coach-severity cues are throttled by a minimum interval between any two coach cues (rejected at +10s, accepted at +26s).
- `testSameCueInterval`: the identical cue id is rejected within 60s but accepted after 121s.
- `testHourlyCoachCap`: after 12 accepted coach cues spaced 30s apart, a 13th is rejected (hourly cap).
- `testPriorityOrdering`: `CueSeverity` ordering `critical > protective > coach > celebration`.

**DTCDecodingTests.swift** — XCTest, pure logic + one fixture: reads the real `DTCCatalog.json` resource from the bundle (not a mock, actual shipped data file).
- `testParseP0133`, `testFourFamilies`: `OBDFrameParser.parseDTCResponse` correctly decodes mode-43 DTC byte pairs into P/C/B/U-coded strings.
- `testCatalogHasP0133`: catalog JSON has correct title/system/severity keys and en/tr localized text for P0133.
- `testCatalogHasBMWPriorityCodes`: a list of BMW-flagged codes (P0016, P0171, P0300, P0420, P1519, P1120) are present, flagged `bmw: true`, have non-empty Turkish text, and catalog has ≥30 entries total.
- `testNoDataReturnsEmpty`: "NO DATA" response yields no codes.

**DrivingScorerTests.swift** — XCTest, pure unit logic.
- `testPerfectTripIsNear100`: a trip with no events/idle/overspeed scores ~100 with "smooth" badge.
- `testHarshAccelPenaltyNormalizedPer100Km`: acceleration penalty is normalized per-100km and matches a hand-computed value from harsh-accel events.
- `testIdlePenaltyStartsAfter10Percent`: idle score penalty only kicks in above a 10% idle ratio.
- `testBadgeBoundaries`: badge key transitions correctly at score-breakdown boundary values (90 → "smooth", 75 → "steady").

**EventDetectorTests.swift** — XCTest, `@MainActor`, pure unit logic (constructs synthetic `VehicleSnapshot`s via a private helper).
- `testHarshBrakingSevere`: 3 successive snapshots simulating rapid deceleration trigger a `.harshBrake`/`.severe` event.
- `testOverrevWhenCold` / `testNoOverrevWhenWarm`: high RPM at low coolant temp triggers `.overrev`; same RPM at warm coolant does not.
- `testOverheatSeverity`: coolant 110°C → normal-severity overheat event, 120°C → severe.

**ExportTests.swift** — XCTest, `@MainActor`, imports CoreLocation. Uses in-memory `Trip` model objects (real SwiftData model, not persisted) as fixtures; writes to real temp files via the exporters and reads them back.
- `testCSVHeaderExact`: `CSVExporter.tripHeader` matches an exact expected column string.
- `testCSVEscapesQuotes`: quote characters in place names are CSV-escaped and numeric fields formatted with 6 decimal places.
- `testGPXContainsTrackPoints`: GPX export contains valid XML version and `<trkpt>` elements for each route coordinate (via `RouteSimplifier.encode`).

**FormatterTests.swift** — XCTest, pure unit logic with `AppSettings` fixtures (isolated `UserDefaults` suites) to control units/locale. 10 tests: nil→"unavailable" fallback, metric vs imperial speed formatting, Fahrenheit temperature conversion, consumption-unit conversion (mpg US), short/live duration formatting, `TextBar.make` ASCII progress-bar rendering at several fill ratios, and locale-specific decimal separators (en vs tr) for `MetricFormatter.consumption`.

**FuelCalculatorTests.swift** — XCTest, pure unit logic using synthetic `VehicleSnapshot`s. 10 tests covering `FuelCalculator.fuelRateLh` for each data source (engine fuel rate PID, MAF-based, speed-density estimate, nil when no data available), `instantL100` for cruising vs idle, trapezoidal fuel/distance integration over a simulated 1-hour trip, valid-average-consumption range check, diesel MAF coefficient constant, and that a calibration factor multiplies the MAF-derived rate correctly.

**FuelCalibratorTests.swift** — XCTest, `@MainActor`. Note: tests largely re-implement/assert the calibration math inline (acceptance criteria, EMA blend, clamp range, out-of-range rejection) rather than calling into a `FuelCalibrator` class directly — more of an algorithm/formula-verification suite than an integration test against the actual calibrator object. Pure logic, no mocks.

**PIDParsingTests.swift** — XCTest, pure unit logic. The largest and most thorough suite (28 tests) covering `OBDFrameParser.parse`/`parseMode22`/`parseDTCResponse`, `OBDPIDCatalog` value parsers (RPM, speed, coolant, fuel level, load, MAP, intake air, MAF, throttle, voltage, fuel rate), and BMW-specific extended PIDs via `VLinkerPIDCatalog` (oil temp DID D3B0 and legacy 4402, oil pressure, ignition advance, MAF, ambient temp, transmission oil), plus response-framing edge cases (spaced/unspaced bytes, CAN header prefix, "SEARCHING...", ISO-TP length byte, "NO DATA", "?", "UNABLE TO CONNECT", "STOPPED"/"CAN ERROR"/"BUFFER FULL" retry responses).

**SpeedCalibratorTests.swift** — XCTest, pure unit logic. Small suite (3 tests): median of odd/even-length sample arrays, and clamp-to-range logic (0.85–1.10) — the clamp test asserts inline logic rather than calling a `SpeedCalibrator` method directly.

**TripRecorderTests.swift** — XCTest, `@MainActor`, async tests. Uses real (not mocked) SwiftData `ModelContainer`/`ModelContext` — one in-memory-configured, one via `StorageStack.makeContainer()` — plus isolated `AppSettings`/`UserDefaults` and a real `LocationProvider`. This is closer to an integration test than a pure unit test.
- `testTripStateTransitions`: manual start/stop cycles the recorder through `.idle` → active → `.idle`, and a short trip is not persisted.
- `testShortTripDiscardedViaManual`: a trip stopped immediately after starting (under distance/duration floor) is discarded and not present in `repo.recentTrips`.

**VINDecoderTests.swift** — XCTest, pure unit logic with a private VIN-assembly/check-digit helper used as a fixture generator (not mocking `VINDecoder` itself).
- `testValidBMWVIN`: decodes WMI "WBA" to manufacturer "BMW", valid check digit, 17-char length.
- `testRejectsIOQ` / `testRejectsWrongLength`: invalid-character and wrong-length VINs return `nil`.
- `testModelYearTable`: model-year code "G" maps to 2016.
- `testInvalidCheckDigitFlagged`: a mutated check-digit character is decoded but flagged `isCheckDigitValid == false`.
- `testValidateCheckDigitDirect`: `VINDecoder.validateCheckDigit` on a non-BMW WMI (Volkswagen "WVWZZZ1J...") still validates correctly, confirming the check-digit algorithm itself isn't BMW-specific.

**BMWCenterUITests/SmokeTests.swift** — XCTest UI testing (`XCUIApplication`), full-app smoke test, not a mock. Single test method `testTabsOpenWithoutCrash`: launches the real app, waits for the tab bar to exist, taps through each of the 5 expected tabs (Dashboard, Trips, Fuel, Insights, Settings) if present by name (falls back gracefully if localized names don't match), then asserts the tab bar still has ≥5 buttons and taps each by index, confirming the app doesn't crash. This is the only UI-level test in the repo; it does not assert on any specific screen content, only that navigation doesn't crash.

## Build & Test Run Results

**Build settings check:** `xcodebuild -showBuildSettings` for scheme `BMWCenter` against `generic/platform=iOS Simulator` resolved successfully — the scheme is valid and buildable.

**Test run:** Ran against booted simulator `iPhone 17 Pro Max` (`61569348-1B86-40E2-B043-117A3CD37C86`):

```
xcodebuild -project BMWCenter.xcodeproj -scheme BMWCenter -destination 'id=61569348-1B86-40E2-B043-117A3CD37C86' test
```

Result: **`** TEST SUCCEEDED **`**

- `Test Suite 'BMWCenterTests.xctest' passed` — **Executed 100 tests, with 0 failures (0 unexpected)** in 0.77s.
- `Test Suite 'All tests' passed` — 100/100.
- Only the `BMWCenterTests` unit-test bundle executed under this `test` action; `BMWCenterUITests` (`SmokeTests.swift`) did **not** run as part of this invocation — no `BMWCenterUITests` suite appears anywhere in the xcodebuild log. This means the `BMWCenter` scheme's Test action, as currently configured (or as invoked here), does not include the UI test target — either it isn't attached to the scheme's test plan, or it's a separate target that needs to be targeted explicitly (e.g., `-only-testing:BMWCenterUITests`). So while unit-test pass status is confirmed 100/100, the UI smoke test's current pass/fail status was **not verified** by this run.
- One benign warning appeared during the run, unrelated to test correctness: an `objc` duplicate-class warning about `UIAccessibilityLoaderWebShared` between WebKit/WebCore accessibility bundles in the simulator runtime — harness/runtime noise, not app or test code.

## Coverage Gaps

Comparing the `Core/` module inventory against the existing test files, the following modules/classes have **no dedicated test file at all**:

- **Core/Alerts** — `AlertEngine.swift`, `AlertRule.swift`, `AudioAnnouncer.swift` (AudioAnnouncer is only exercised indirectly as a collaborator inside `CueSchedulerTests`, not tested directly).
- **Core/OBD (transport/service layer)** — `BLEOBDTransport.swift`, `OBDTransport.swift`, `MockOBDTransport.swift`, `OBDService.swift`, `DTCMonitor.swift`, `DTCService.swift`, `ELM327Commands.swift` (only the pure parsing layer — `OBDFrameParser`/`OBDPIDCatalog`/`VLinkerPIDCatalog` — is covered by `PIDParsingTests`/`DTCDecodingTests`; the actual transport/connection/session-management code is untested).
- **Core/Care (individual features without dedicated files)** — `BadgeService.swift`, `CareCoordinator.swift`, `ChallengeEngine.swift`, `EcoCoach.swift`, `SeverityRouter.swift`, `StreakService.swift`, `ThermostatWatch.swift`, `TripSummaryCardRenderer.swift` (only `BaselineLearner`, `OilTempEstimator`, `EngineReadyService`, `ColdEngineShield`, `ThermalShockGuard`, `AdaptiveMaintenance`, `FuelTrimMonitor`, `GearCoach`, `OverheatWatchdog`, `BatteryGuardian`, `CueScheduler` are covered).
- **Core/LiveActivity** — `LiveActivityController.swift`, `TripActivityAttributes.swift` — no tests.
- **Core/Maintenance** — `MaintenanceService.swift`, `MaintenanceTemplates.swift` — no tests.
- **Core/Sync** — `CloudSyncController.swift`, `PhoneWatchBridge.swift` — no tests.
- **Core/Storage** — `Migrations.swift`, `StorageStack.swift`, `Models.swift`, `FuelRepository.swift` — no dedicated tests (`TripRepository`/model container are only touched incidentally inside `TripRecorderTests` as fixtures, not tested for their own behavior; `FuelRepository` and `Migrations` are entirely untested).
- **Core/Analysis** — `AccelTestRunner.swift`, `IdleAnalyzer.swift` — no tests (contrast with `DrivingScorer`, `EventDetector`, `SpeedCalibrator`, `BatteryHealthAnalyzer` in the same folder, which are covered).
- **Core/Intents** — `BMWCenterShortcuts.swift`, `FuelLevelIntent.swift`, `LastTripIntent.swift`, `StartTripIntent.swift`, `StopTripIntent.swift` — no tests.
- **Core/Settings** — `AppSettings.swift`, `UnitSystem.swift` — no dedicated test file (used extensively as a fixture/collaborator across many other test files, but its own logic, e.g. persistence/derived properties, is not directly asserted).
- **Core/Widgets** — `WidgetDataStore.swift` — no tests.
- **Core/Export** — `PDFReportBuilder.swift` — untested (CSV/GPX exporters are covered by `ExportTests`, but PDF report generation is not).
- **Core/Trip** — `LocationProvider.swift`, `RouteSimplifier.swift`, `TripState.swift` — no dedicated tests (`RouteSimplifier.encode` is exercised only incidentally inside `ExportTests`'s GPX test, and `LocationProvider`/`TripState` are only used as collaborators inside `TripRecorderTests`).
- **Core/Util** — `EMA.swift`, `Log.swift`, `RingBuffer.swift`, `Throttle.swift` — no dedicated tests (only `Formatters.swift` in this folder is covered, by `FormatterTests`).
- **BMWCenterUITests** — only one smoke test exists (`SmokeTests.swift`, 1 method) covering tab-bar navigation; no UI tests for individual screens/flows (Dashboard, Trips, Fuel, Insights, Settings detail views, onboarding, permission prompts, etc.), and this suite's current pass/fail status was not confirmed by the `test` action run in this session.
- **App/**, **CarPlay/**, **Phone/** (SwiftUI view layer), **DesignSystem/**, and **BMWCenterWidgets/BMWCenterWatch** targets have no unit or UI test coverage at all.

Overall: coverage today is concentrated almost entirely on pure-function/algorithmic logic within Analysis, Fuel, and parts of Care/OBD-parsing — modules with side effects, persistence, networking/BLE transport, background delivery (LiveActivity, Sync, Alerts, Widgets), and the SwiftUI view layer are effectively untested. This is the baseline Phase 1+ work (§239 Definition of Done: "unit tests exist" for every new component) will build on top of.
