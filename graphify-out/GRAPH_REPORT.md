# Graph Report - bmwcenter  (2026-08-06)

## Corpus Check
- 122 files · ~61,648 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 832 nodes · 1511 edges · 21 communities detected
- Extraction: 70% EXTRACTED · 30% INFERRED · 0% AMBIGUOUS · INFERRED: 450 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]

## God Nodes (most connected - your core abstractions)
1. `CarPlayCoordinator` - 25 edges
2. `OBDService` - 24 edges
3. `BLEOBDTransport` - 23 edges
4. `PIDParsingTests` - 21 edges
5. `TripRepository` - 18 edges
6. `TripRecorder` - 18 edges
7. `Formatters` - 15 edges
8. `MockOBDTransport` - 14 edges
9. `LocationProvider` - 14 edges
10. `VehicleSnapshot` - 12 edges

## Surprising Connections (you probably didn't know these)
- `PIDParsingTests` --inherits--> `XCTestCase`  [EXTRACTED]
  BMWCenterTests/PIDParsingTests.swift →   _Bridges community 2 → community 15_
- `DTCDecodingTests` --inherits--> `XCTestCase`  [EXTRACTED]
  BMWCenterTests/DTCDecodingTests.swift →   _Bridges community 2 → community 12_
- `EventDetectorTests` --inherits--> `XCTestCase`  [EXTRACTED]
  BMWCenterTests/EventDetectorTests.swift →   _Bridges community 2 → community 10_
- `ExportTests` --inherits--> `XCTestCase`  [EXTRACTED]
  BMWCenterTests/ExportTests.swift →   _Bridges community 2 → community 6_
- `SpeedCalibratorTests` --inherits--> `XCTestCase`  [EXTRACTED]
  BMWCenterTests/SpeedCalibratorTests.swift →   _Bridges community 2 → community 11_

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (73): AccelConfidence, low, normal, AccelResult, AnyObject, CaseIterable, Codable, DrivingScorer (+65 more)

### Community 1 - "Community 1"
Cohesion: 0.03
Nodes (30): AccelTestView, AdapterScanView, AddRefuelSheet, AddReminderSheet, AlertStrip, BatteryHealthView, CalibrationCard, CalibrationView (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (14): FuelCalculator, FuelIntegrationState, FuelSample, FuelCalculatorTests, FuelCalibratorTests, MaintenanceTemplates, Migrations, SmokeTests (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.07
Nodes (13): AppSettings, Keys, DTCListView, Formatters, FormatterTests, FuelTemplateBuilder, HistoryTemplateBuilder, LiveTemplateBuilder (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (16): AlertPresenter, AppDelegate, CarPlayCoordinator, CarPlaySceneDelegate, CPTabBarTemplateDelegate, CPTemplateApplicationSceneDelegate, FuelStatistics, DrivingSummary (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (16): AlertEngine, ActiveAlert, AlertSeverity, critical, info, warning, AppEnvironment, AudioAnnouncer (+8 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (8): CSVExporter, ExportTests, GPXExporter, Log, RingBuffer, RouteSimplifier, TripRepository, VINDecoderTests

### Community 7 - "Community 7"
Cohesion: 0.07
Nodes (5): ELM327Commands, MockOBDTransport, OBDPIDCatalog, OBDService, Throttle

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (27): AlertRule, AlertRules, VehicleProfileSnapshot, FuelPeriod, all, month, today, week (+19 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (14): trips, FuelCalibrator, FuelRepository, AccelRecord, CalibrationSample, CrankRecord, DrivingEvent, DTCRecord (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.08
Nodes (11): BatteryAssessment, BatteryHealthAnalyzer, BatteryStatus, fair, good, weak, CrankEvent, BatteryHealthTests (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.08
Nodes (7): BLEOBDTransport, OBDCommandQueue, CBCentralManagerDelegate, CBPeripheralDelegate, OBDTransport, SpeedCalibrator, SpeedCalibratorTests

### Community 12 - "Community 12"
Cohesion: 0.07
Nodes (17): ActivityAttributes, AppTab, dashboard, fuel, insights, settings, DTCDecodingTests, Hashable (+9 more)

### Community 13 - "Community 13"
Cohesion: 0.09
Nodes (11): Decodable, DTCCatalogEntry, DTCService, OBDFrameParseResult, badResponse, disconnected, noData, retry (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (13): FuelLevelEntry, FuelLevelProvider, FuelLevelWidget, FuelLevelWidgetView, LastTripEntry, LastTripProvider, LastTripWidget, LastTripWidgetView (+5 more)

### Community 15 - "Community 15"
Cohesion: 0.18
Nodes (1): PIDParsingTests

### Community 16 - "Community 16"
Cohesion: 0.15
Nodes (6): AccelTestRunner, AppIntent, FuelLevelIntent, LastTripIntent, StartTripIntent, StopTripIntent

### Community 17 - "Community 17"
Cohesion: 0.4
Nodes (3): App, BMWCenterApp, WatchApp

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (1): GaugeIconRenderer

### Community 19 - "Community 19"
Cohesion: 0.67
Nodes (2): AppShortcutsProvider, BMWCenterShortcuts

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): BMWCenterWidgetsBundle, WidgetBundle

## Knowledge Gaps
- **69 isolated node(s):** `Keys`, `metric`, `imperial`, `l100km`, `kmPerL` (+64 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 15`** (21 nodes): `PIDParsingTests.swift`, `.parse()`, `PIDParsingTests`, `.testCoolant()`, `.testFuelLevel()`, `.testFuelRate()`, `.testHeaderFrame()`, `.testIntake()`, `.testLoad()`, `.testMAF()`, `.testMAP()`, `.testNoData()`, `.testQuestion()`, `.testRetry()`, `.testRPMNoSpaces()`, `.testRPMSpaced()`, `.testSearchingPrefix()`, `.testSpeed()`, `.testThrottle()`, `.testUnableToConnect()`, `.testVoltage()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (4 nodes): `GaugeIconRenderer.swift`, `GaugeIconRenderer`, `.icon()`, `.tintHash()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (3 nodes): `AppShortcutsProvider`, `BMWCenterShortcuts.swift`, `BMWCenterShortcuts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (3 nodes): `BMWCenterWidgetsBundle.swift`, `BMWCenterWidgetsBundle`, `WidgetBundle`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `BLEOBDTransport` connect `Community 11` to `Community 0`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `OBDService` connect `Community 7` to `Community 13`, `Community 5`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Why does `AddRefuelSheet` connect `Community 1` to `Community 2`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 64 inferred relationships involving `String` (e.g. with `.init()` and `.peripheral()`) actually correct?**
  _`String` has 64 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Keys`, `metric`, `imperial` to the rest of the system?**
  _69 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._