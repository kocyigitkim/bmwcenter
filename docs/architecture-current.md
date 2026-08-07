# BMWCenter — Current Architecture (Phase 0 Audit)

**Status:** Snapshot as of 2026-08-07, before any Phase 1+ refactoring. Read-only description of what exists — not a design proposal. See `docs/PRD.md` for the target architecture this will be compared against in later phases.

## 1. Top-level module/folder structure

- **`BMWCenter/App/`** — App lifecycle wiring: `BMWCenterApp.swift` (SwiftUI `@main`), `AppDelegate.swift` (UIKit app delegate + scene routing), `AppEnvironment.swift` (the app's single composition root/DI container), `PhoneSceneDelegate.swift` (phone window bootstrap).
- **`BMWCenter/CarPlay/`** — CarPlay scene delegate, `CarPlayCoordinator` (drives CPTemplates from the same `AppEnvironment`), and `Templates/`/`Rendering/` subfolders building/rendering CarPlay UI (list templates, gauge icons, text bars, alerts).
- **`BMWCenter/Core/`** — All non-UI domain logic, organized by feature area (OBD transport/parsing, trip/fuel/analysis engines, storage, "Care" driver-coaching engine, alerts, live activities, maintenance, settings, sync, intents, widgets data bridge, generic utilities). This is effectively the app's "business logic" layer today (see §3).
- **`BMWCenter/DesignSystem/`** — Shared SwiftUI visual language: design tokens (color, typography, spacing, motion), a `GlassSurface` container view, `GaugeZone`, and `MetricFormatter`. No domain logic.
- **`BMWCenter/Phone/`** — SwiftUI phone UI, organized by screen/feature: `Root` (tab shell), `Dashboard`, `Diagnostics`, `Fuel`, `Insights`, `Maintenance`, `Settings`, `Trips`, plus a shared `Components/` folder (gauge rings, sparklines, metric tiles, status pills, etc.). Each feature folder generally pairs a `View` with a `ViewModel`/state object.
- **`BMWCenter/Resources/`** — Asset catalog (`Assets.xcassets`), Info.plist, entitlements files (`BMWCenter.entitlements`, `BMWCenter-CarPlay.entitlements`).
- **`BMWCenterWidgets/`** — WidgetKit extension target: `FuelLevelWidget.swift`, `LastTripWidget.swift`, `TripLiveActivityView.swift` (ActivityKit Live Activity UI), `BMWCenterWidgetsBundle.swift`. Reads state via `Core/Widgets/WidgetDataStore.swift` and `Core/LiveActivity/TripActivityAttributes.swift`, which are shared into this target as individual source files (see `project.yml`).
- **`BMWCenterWatch/`** — watchOS companion app source (`WatchApp.swift`, `WatchLiveView.swift`, `WatchTripControlView.swift`, `WatchConnectivityBridge.swift`) that talks to the phone via `Core/Sync/PhoneWatchBridge.swift`'s WatchConnectivity counterpart.
- **`BMWCenterTests/` / `BMWCenterUITests/`** — Unit and UI test targets.

## 2. The App layer / startup

- **`BMWCenterApp.swift`** is the SwiftUI `@main` entry point but only provides an empty, hidden `WindowGroup` — real window setup is deliberately deferred to UIKit scene delegates via `@UIApplicationDelegateAdaptor(AppDelegate.self)`.
- **`AppDelegate.swift`** requests notification authorization, then on `didFinishLaunching` calls `AppEnvironment.shared.start()` inside a `Task { @MainActor in ... }`. Its `configurationForConnecting` method is the scene router: CarPlay connections (`role == .carTemplateApplication`) get `CarPlaySceneDelegate`, everything else gets `PhoneSceneDelegate`.
- **`AppEnvironment.swift`** is the app's dependency-injection root: a `@MainActor final class ObservableObject` singleton (`AppEnvironment.shared`). Its `private init()` constructs, in order, `AppSettings`, the SwiftData `ModelContainer`/`ModelContext` (via `StorageStack.makeContainer()`), `TripRepository`, `FuelRepository`, `LocationProvider`, `OBDService`, `TripRecorder`, `FuelStatistics`, `AudioAnnouncer`, `AlertEngine`, `MaintenanceService`, `PhoneWatchBridge`, `CareCoordinator`, and `DTCMonitor` — wiring them together purely through constructor injection (no DI framework/container abstraction; it's a hand-written object graph). `start()` (idempotent via a `started` flag) then does the runtime wiring: starts maintenance defaults, cloud sync, watch bridge binding, alert/care/DTC listening on `obd.snapshots`, trip recorder hookup, location permission request, a background `Task` that republishes widget snapshots via `WidgetDataStore`, and finally `obd.start()`.
- **`PhoneSceneDelegate.swift`** grabs `AppEnvironment.shared`, calls `env.start()`, builds `RootTabView()` injecting `env.settings` (`.environment`), `env` itself, `env.obd`, and `env.tripRecorder` (`.environmentObject`), plus `.modelContainer(env.container)`, and hosts it in a `UIHostingController` with `overrideUserInterfaceStyle = .dark`.
- **`CarPlaySceneDelegate.swift`** similarly grabs `AppEnvironment.shared`, calls `env.start()` (safe/idempotent), and constructs a `CarPlayCoordinator(interfaceController:env:)`. Both the phone and CarPlay entry points share the *same* singleton `AppEnvironment` instance and its single `OBDService`, so BLE/telemetry state is shared naturally rather than duplicated.

There is no DI container/library (no Swinject-style resolver, no property wrappers for injection besides SwiftUI's `@Environment`/`@EnvironmentObject`); it is a single manually-wired singleton object graph.

## 3. Core/ module inventory

**Core/OBD** — transport, protocol parsing, and the polling engine:
- `OBDTransport.swift`: protocol abstraction (`OBDTransport`) plus shared types (`OBDConnectionState`, `OBDError`, `DiscoveredAdapter`).
- `BLEOBDTransport.swift`: CoreBluetooth-based implementation of `OBDTransport` talking to ELM327-style BLE adapters; contains an `actor OBDCommandQueue` for serializing sends.
- `MockOBDTransport.swift`: simulator/demo implementation of the same protocol.
- `ELM327Commands.swift`: raw AT/OBD command string constants and the init handshake sequence.
- `OBDFrameParser.swift`: parses raw ELM327 response strings into PID byte values (or VIN).
- `OBDPID.swift`: the PID catalog (`OBDPIDCatalog`) mapping PID bytes to parse/apply functions on `VehicleSnapshot`.
- `VehicleSnapshot.swift`: the shared live-telemetry value type (speed, RPM, coolant, fuel level, etc.).
- `OBDService.swift`: the `@MainActor ObservableObject` façade — owns transport selection (mock vs BLE), auto-connect/reconnect logic, tiered polling loop (fast/medium/slow/rare PID cadences), fuel-rate calculation hookup, DTC access, and publishes an `AsyncStream<VehicleSnapshot>`. This is the single class the rest of the app talks to for vehicle data.
- `DTCService.swift` / `DTCMonitor.swift`: diagnostic trouble code reading/clearing and background DTC monitoring/alerting.
- `VINDecoder.swift`: VIN string decoding.
- `VLinker/ExtendedPIDSession.swift`, `VLinker/VLinkerPIDCatalog.swift`: vendor/OEM-specific extension for VLinker MC-iOS adapters' Mode-22 (UDS-style) PIDs, e.g. BMW-specific oil temperature DID — this is the one place with vehicle-brand-specific protocol logic beyond generic OBD-II.

**Core/Analysis** — derived driving/vehicle metrics: `AccelTestRunner` (0-100 timing), `BatteryHealthAnalyzer`, `DrivingScorer`, `EventDetector` (harsh braking/accel via motion+OBD), `IdleAnalyzer`, `SpeedCalibrator` (GPS vs OBD speed calibration).

**Core/Care** — a driver-coaching/vehicle-protection engine, the largest Core module (20 files). `CareFeature.swift` defines the plugin protocol (`isEnabled`, `isAvailable`, `evaluate(snapshot:context:)`, `onTripEnded`); concrete features (`OverheatWatchdog`, `FuelTrimMonitor`, `EngineReadyService`, `ThermalShockGuard`, `EcoCoach`, `ColdEngineShield`, `AdaptiveMaintenance`, `ThermostatWatch`, `ChallengeEngine`, `GearCoach`, `BatteryGuardian`) each implement it. `CareCoordinator.swift` owns the feature list and drives evaluation off `OBDService.snapshots`. `BaselineLearner`, `OilTempEstimator` support estimation; `BadgeService`, `StreakService`, `CueScheduler`, `SeverityRouter`, `CareTypes`, `TripSummaryCardRenderer` handle gamification/notification plumbing.

**Core/Intents** — App Intents/Siri Shortcuts integration: `BMWCenterShortcuts.swift` (shortcut definitions), `FuelLevelIntent`, `LastTripIntent`, `StartTripIntent`, `StopTripIntent`.

**Core/Storage** — SwiftData persistence: `Models.swift` (19 `@Model` classes: `Trip`, `TripSample`, `DrivingEvent`, `RefuelEntry`, `FuelPricePoint`, `CalibrationSample`, `VehicleProfile`, `MaintenanceItem`, `DTCRecord`, `CrankRecord`, `AccelRecord`, `BaselineMetric`, `ProtectionEvent`, `ChallengeProgress`, `BadgeAward`, `StreakState`, `MaintenanceLedger`, `ThermalEvent`), `StorageStack.swift` (container creation), `Migrations.swift`, `TripRepository.swift`, `FuelRepository.swift` (query/aggregation helpers over the model context). See `docs/data-model-current.md` for full detail.

**Core/Export** — `CSVExporter`, `GPXExporter`, `PDFReportBuilder` for exporting trip/fuel data.

**Core/Fuel** — `FuelCalculator` (rate/consumption math), `FuelCalibrator` (actor; learns calibration factor from refuel entries vs OBD-estimated fuel use), `FuelStatistics` (daily/weekly aggregates, last refuel).

**Core/Trip** — `TripRecorder` (start/stop/state machine driven by OBD snapshots + connection state), `TripState.swift`, `LocationProvider` (CoreLocation wrapper), `RouteSimplifier` (Douglas-Peucker style GPS simplification for storage/export).

**Core/Sync** — `CloudSyncController` (CloudKit-oriented sync controller, gated by `startIfNeeded()`), `PhoneWatchBridge` (WatchConnectivity bridge to `BMWCenterWatch`).

**Core/Alerts** — `AlertEngine` (rule evaluation against snapshots), `AlertRule.swift`, `AudioAnnouncer` (spoken alerts).

**Core/LiveActivity** — `LiveActivityController` (ActivityKit start/update/end), `TripActivityAttributes.swift` (shared `ActivityAttributes` struct, also compiled directly into the Widgets extension target per `project.yml`).

**Core/Maintenance** — `MaintenanceService` (reminders/scheduling, `ensureDefaults()`), `MaintenanceTemplates.swift` (default maintenance item catalog).

**Core/Settings** — `AppSettings` (a settings/preferences store used pervasively for user config: adapter, units, vehicle platform, calibration factors), `UnitSystem.swift`.

**Core/Widgets** — `WidgetDataStore.swift`: shared App-Group-backed store the phone app writes to (`AppEnvironment.publishWidget`) and the widget extension reads from; the only integration point between `BMWCenter` and `BMWCenterWidgets` besides the shared `TripActivityAttributes.swift` source file.

**Core/Util** — generic helpers: `EMA` (exponential moving average), `Formatters`, `Log`, `RingBuffer`, `Throttle` (an `actor` used to rate-limit UI refresh work, e.g. in `CarPlayCoordinator`).

## 4. CarPlay integration

- **`CarPlaySceneDelegate.swift`** is a `CPTemplateApplicationSceneDelegate`. On connect it fetches `AppEnvironment.shared`, calls `env.start()` (safe to call twice — guarded by `started`), and instantiates `CarPlayCoordinator(interfaceController:env:)`, retaining it for the scene's lifetime; on disconnect it stops and releases the coordinator.
- **`CarPlayCoordinator.swift`** (`@MainActor`) builds and maintains a `CPTabBarTemplate` with four tabs, each backed by a dedicated template builder: `LiveTemplateBuilder` (live gauges + connect/refresh actions), `TripTemplateBuilder` (active trip recording state), `FuelTemplateBuilder` (today/week fuel summary + refuel history, with a pushed detail template), `HistoryTemplateBuilder` (recent trips list + pushed trip detail). `AlertPresenter` (in `Templates/`) shows CarPlay alerts for Bluetooth-off/disconnected states. `GaugeIconRenderer`/`TextBar` (in `Rendering/`) render small images used as list item icons/badges.
- Data sharing with the phone UI is entirely through the **same `AppEnvironment` singleton instance**: the coordinator reads `env.obd.snapshot`/`env.obd.snapshots`, `env.tripRecorder.live`/`.state`, `env.tripRepository.recentTrips(...)`, `env.fuelStatistics.dailyFuel()`, `env.settings`. There is no separate CarPlay-specific data layer or IPC — it's in-process shared state, live-updated via the `OBDService.snapshots` `AsyncStream` and Combine `$connection`/`$live` publishers, throttled through `Core/Util/Throttle`. This means CarPlay and phone reflect a single OBD connection/trip session simultaneously since they share one `AppEnvironment`.

Per the PRD (§78-81), CarPlay currently mirrors much of the phone experience (four tabs including fuel history and trip history detail) rather than the minimal driving-relevant status screen the PRD recommends — this gap is expected to be addressed in Phase 10 (§250), not now.

## 5. Existing abstraction boundaries

- **`protocol OBDTransport: AnyObject`** (`Core/OBD/OBDTransport.swift`) is the cleanest boundary in the codebase: `OBDService` depends only on this protocol (`private var transport: OBDTransport?`), with two concrete implementations (`BLEOBDTransport`, `MockOBDTransport`) swapped based on `AppSettings.useMockAdapter`. This is effectively today's rudimentary "Transport" layer from the PRD's target architecture, but it is a single flat protocol (connect/scan/disconnect/send string, no separate Adapter/Protocol/Session/Scheduler split).
- **`protocol CareFeature: AnyObject`** (`Core/Care/CareFeature.swift`) is a plugin-style abstraction: 11 concrete "Care" engines conform to it and are driven uniformly by `CareCoordinator`, each declaring `requiredPIDs`/`optionalPIDs` for capability gating (`isAvailable(supportedPIDs:)`) — a small precursor to a capability-engine concept, scoped just to the Care domain.
- **`actor`s** used for concurrency-safe mutable state: `OBDCommandQueue` (BLE send serialization), `Throttle` (rate limiting), `AppSettings`, `FuelCalibrator`, `SpeedCalibrator`, `OilTempEstimator`, `RouteSimplifier`, `TripRecorder`. `OBDService`, `CareCoordinator`, `AppEnvironment`, `CarPlayCoordinator` are `@MainActor` classes rather than actors.
- **`OBDPIDCatalog`** (`OBDPID.swift`) centralizes generic-vs-not PID parsing as data (pid → parse/apply closures), which is a mild separation of "PID knowledge" from the polling loop, though the loop itself (`OBDService.pollOnce`) hardcodes PID lists/tiers/cadences directly rather than delegating to a scheduler abstraction.
- Everything else (Storage repositories, Analysis, Alerts, Trip, Fuel, Export, Maintenance, Sync) is concrete, non-protocol classes/structs constructed directly by `AppEnvironment` — no repository/service protocols, no mocking seam other than for `OBDTransport` itself. Views depend on concrete `OBDService`/`TripRecorder`/`AppEnvironment` types via `@EnvironmentObject`, not on protocols.

## 6. Coupling assessment

- **OBD/BLE specifics stay inside `Core/OBD`.** UI code (Phone and CarPlay) never imports CoreBluetooth or constructs ELM327 command strings directly. `ELM327Commands`, `OBDFrameParser`, and `BLEOBDTransport` are used only within `Core/OBD`.
- **UI talks to `OBDService`, not the transport.** Both `BMWCenter/Phone/Settings/AdapterScanView.swift` (the BLE pairing screen) and `CarPlayCoordinator` call `obd.scan()`, `obd.discoveredAdapters`, `obd.connect(to:)`, `obd.snapshot`/`.snapshots` — i.e. they consume the `OBDService` façade and its `DiscoveredAdapter`/`VehicleSnapshot`/`OBDConnectionState` types, never `CBPeripheral` or raw transport calls. This is a genuinely respected boundary today.
- **The one BMW-specific protocol logic (`VLinker/ExtendedPIDSession.swift`, `VLinker/VLinkerPIDCatalog.swift`, and the `bmwOilTempMode22`/`ATSH7E0` constants in `ELM327Commands.swift`) lives inside `Core/OBD`** rather than being separated into a distinct "OEM diagnostics" module — `OBDService.pollOnce` directly branches on `settings.vehiclePlatform != .universal` to decide whether to run the VLinker/BMW extended-PID probe, so generic OBD-II polling and BMW-specific Mode-22 polling are interleaved in the same method rather than layered. This is the clearest concrete example of the PRD's §22/§103 "capability engine / OEM provider" gap — Phase 3 and Phase 11 will need to pull this apart.
- **`OBDService` itself is a large, monolithic façade** (~555 lines) combining: transport lifecycle/reconnect policy, tiered PID scheduling, fuel-rate derivation (calls into `Core/Fuel/FuelCalculator`), DTC access, VIN reading, high-rate speed sampling, and ad hoc debug probing/logging to disk (`persistDebug`, `runVLinkerProbe`) — there is no separation yet between a "Session" concept, a "Scheduler" concept, and the service/façade itself; they're all one class. This is the main concrete gap relative to the PRD's Transport/Adapter/Protocol/Session/Scheduler layering (PRD §120, §241).
- **Widgets/Watch integration is by shared-file/App-Group, not by shared framework.** `Core/Widgets/WidgetDataStore.swift` and `Core/LiveActivity/TripActivityAttributes.swift` are compiled into both the `BMWCenter` app target and the `BMWCenterWidgets` extension target as duplicated source-file membership (declared in `project.yml`), rather than via a shared framework/module — a build-configuration form of coupling worth noting for later modularization.
- **Care engine only depends on `VehicleSnapshot`/`AppSettings`/`Trip`**, not on transport/BLE types directly, so it's cleanly decoupled from OBD wire-level detail (via the `CareFeature` protocol and `CareCoordinator`).

## 7. Target wiring (project.yml vs actual Xcode project)

`project.yml` declares four targets: `BMWCenter` (app), `BMWCenterWidgets` (app-extension), `BMWCenterTests` (unit tests), `BMWCenterUITests` (UI tests). `BMWCenterWatch` sources exist on disk but are **not** declared as a target in `project.yml` at all.

Cross-checking the generated `BMWCenter.xcodeproj/project.pbxproj`:

- **Wired in (native targets present):** `BMWCenter`, `BMWCenterTests`, `BMWCenterUITests`, `BMWCenterWidgets`.
- **Present as source only, not wired into any target:** `BMWCenterWatch/` — its four Swift files (`WatchApp.swift`, `WatchLiveView.swift`, `WatchTripControlView.swift`, `WatchConnectivityBridge.swift`) and `Info.plist` exist on disk but there is no `BMWCenterWatch` entry in `project.yml`'s `targets:` section and no corresponding `PBXNativeTarget` in the `.pbxproj` — the watchOS app is **not currently buildable/shippable** from this project file. Confirms PRD §3/§84: Watch is source-only, secondary priority.
- **Widgets target is declared but not embedded in the app build today:** `project.yml`'s `BMWCenter` target has its `dependencies:` block for `BMWCenterWidgets` commented out, with the inline comment "Free Personal Team: widgets/App Groups disabled for local device install." The `BMWCenter` scheme (`BMWCenter.xcscheme`, the only shared scheme present) likewise only builds `BMWCenter` (all) and `BMWCenterTests` ([test]) — `BMWCenterWidgets` build is commented out of the scheme's build list too. So the widget extension source exists and has a real Xcode target, but is not currently included in the default app build/run due to a free-tier provisioning constraint noted directly in the config. Confirms PRD §3/§170: this is a Personal Team limitation, not an MVP blocker.
- Only one shared scheme (`BMWCenter.xcscheme`) exists under `xcshareddata/xcschemes` — there's no dedicated scheme for widgets, watch, or CarPlay-only testing.

## Summary: gap vs. PRD target architecture

| PRD concept (§11-13, §22, §103, §120) | Current state |
|---|---|
| `VehicleTransport` protocol, multiple transports (ELM/STN/ENET/DoIP/Mock/Replay) | `OBDTransport` protocol exists with 2 implementations (BLE, Mock); no ENET/DoIP/Replay yet |
| `VehicleAdapter` capability probing | Not implemented — no `AdapterCapabilities` model |
| `DiagnosticSession` abstraction | Not implemented — `OBDService` is transport+session+scheduler combined |
| Serialized command scheduler with priority classes (P0-P5) | Partial — `OBDCommandQueue` actor serializes commands (no priority), `OBDService.pollOnce` has hardcoded tiers (not a general scheduler) |
| `CapabilityResolver` (vehicle ∩ adapter ∩ ECU ∩ security) | Not implemented — `CareFeature.isAvailable(supportedPIDs:)` is the only capability-like check, scoped to Care only |
| `OEMProvider` plugin architecture | Not implemented — BMW-specific logic (VLinker Mode-22) is inline in `Core/OBD`, not isolated under `Core/OEM/BMW/` |
| Vehicle Health engine / baseline / anomaly / events registry | Partially implemented inside `Core/Care` (`BaselineLearner`, individual `CareFeature`s) but not organized as the PRD's separate `Core/VehicleHealth/` module |

This table is the starting reference point for Phase 1 (§241) onward.
