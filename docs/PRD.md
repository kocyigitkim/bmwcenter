# BMWCenter

## Master Product Requirements Document, Technical Architecture, MVP Specification and Multi-Brand Roadmap

**Document Version:** 1.0
**Date:** 2026-08-07
**Primary Platform:** iOS 18+
**Primary Language:** Swift 5.9+
**Initial Product Name:** BMWCenter
**Initial Primary Brand:** BMW / MINI
**Long-Term Architecture:** Multi-brand vehicle diagnostics platform
**Primary Connectivity:** Bluetooth Low Energy OBD-II
**Future Connectivity:** STN, ENET, Ethernet, DoIP and brand-specific transports
**Current Build System:** XcodeGen / `project.yml`

---

# 1. Document Purpose

This document is the authoritative product and engineering plan for BMWCenter.

It is intended to be directly consumed by an AI coding agent such as Grok 4.5.

The coding agent MUST:

1. Inspect the existing source code before making architectural changes.
2. Preserve already working functionality.
3. Avoid unnecessary rewrites.
4. Implement functionality incrementally.
5. Keep the project buildable after every implementation phase.
6. Add tests for new domain logic.
7. Never assume that a vehicle supports a feature merely because its manufacturer generally supports it.
8. Never assume all ELM327 adapters expose the same capabilities.
9. Keep read-only diagnostics separate from ECU-writing functions.
10. Keep service functions separate from coding/configuration functions.
11. Never attempt to bypass OEM security mechanisms.
12. Clearly distinguish:

* generic OBD-II,
* enhanced OEM diagnostics,
* service functions,
* coding/configuration,
* predictive analytics.

13. Prefer protocol and capability abstractions over hard-coded vehicle checks scattered throughout the UI.
14. Build all future vehicle-brand integrations through a plugin/provider architecture.
15. Keep the core product useful even when only generic OBD-II access is available.

The final product must not become a collection of isolated OBD commands.

It should become a vehicle intelligence platform.

---

# 2. Current Project Status

The current BMWCenter project is an iOS 18+ vehicle companion application.

Despite the BMWCenter name, it currently has no BMW ConnectedDrive or BMW cloud API integration.

The application communicates directly with vehicles through ELM327-compatible BLE adapters.

Simulator development is possible through an existing mock adapter implementation.

Current bundle identifiers:

```text
com.muhammetkocyigit.bmwcenter
com.muhammetkocyigit.bmwcenter.widgets
com.muhammetkocyigit.bmwcenter.tests
com.muhammetkocyigit.bmwcenter.uitests
```

Current major Apple frameworks:

```text
CoreBluetooth
SwiftData
ActivityKit
AppIntents
WatchConnectivity
CarPlay-related Apple frameworks
```

There are currently no third-party runtime dependencies.

This is desirable and SHOULD remain the default approach during MVP development.

Third-party dependencies may only be introduced later if they provide clear value that cannot reasonably be implemented using Apple frameworks.

---

# 3. Existing Targets

| Target           | Current State                              |
| ---------------- | ------------------------------------------ |
| BMWCenter        | Active                                     |
| BMWCenterWidgets | Defined but embed dependency disabled      |
| BMWCenterTests   | Active                                     |
| BMWCenterUITests | Present                                    |
| BMWCenterWatch   | Source exists but target is not configured |

The Watch application is therefore not part of the current build.

Widget embedding is currently restricted because the project uses a Personal Team configuration.

These are not MVP blockers.

The initial production priority is:

```text
iPhone
    ↓
OBD connection
    ↓
vehicle data
    ↓
diagnostics
    ↓
trip
    ↓
health analysis
```

Watch and widgets are secondary.

---

# 4. Existing Source Structure

Current approximate project structure:

```text
BMWCenter/
├── App/
├── CarPlay/
├── Core/
│   ├── Care/
│   ├── OBD/
│   ├── Analysis/
│   ├── Intents/
│   ├── Storage/
│   ├── Export/
│   ├── Fuel/
│   ├── Trip/
│   ├── Sync/
│   ├── Alerts/
│   ├── LiveActivity/
│   ├── Maintenance/
│   ├── Settings/
│   └── Widgets/
├── DesignSystem/
├── Phone/
│   ├── Components/
│   ├── Settings/
│   ├── Trips/
│   ├── Fuel/
│   ├── Diagnostics/
│   ├── Insights/
│   ├── Dashboard/
│   ├── Maintenance/
│   └── Root/
└── Resources/
```

Existing tests cover areas including:

```text
BaselineLearner
BatteryHealth
CareFeature
CueScheduler
DTCDecoding
DrivingScorer
EventDetector
Export
FuelCalculator
FuelCalibrator
PIDParsing
SpeedCalibrator
TripRecorder
VINDecoder
Formatter
```

The project already contains significant vehicle-analysis infrastructure.

Therefore the goal is NOT to replace the existing project.

The goal is to reorganize and extend it.

---

# 5. Product Vision

BMWCenter should evolve from:

> An ELM327 dashboard and trip logger.

into:

> A local-first vehicle diagnostics, maintenance and predictive health platform that understands both generic OBD-II data and manufacturer-specific vehicle systems.

The long-term product should combine ideas found in:

* BimmerLink,
* BimmerCode,
* Carly,
* OBDeleven,
* BlueDriver,
* OBD Fusion,
* FORScan,
* Carista,
* EVScanner,

while providing a major additional differentiator:

# The application learns the normal behavior of the user's individual vehicle.

Instead of only saying:

```text
Coolant Temperature: 108 °C
```

BMWCenter should eventually be able to say:

```text
108 °C is within the normal operating profile learned for this engine
under the current load and ambient conditions.
```

Or:

```text
Turbo boost control behavior has gradually deviated from your vehicle's
historical baseline during the last six drives.
No DTC has been triggered yet.
```

This predictive layer is the long-term competitive advantage.

---

# 6. Product Principles

The application MUST follow these principles.

## 6.1 Explain, Do Not Merely Display

Bad:

```text
STFT Bank 1: +12.7%
```

Better:

```text
Short-term fuel correction is currently higher than normal.

Current:
+12.7%

Your typical value under similar conditions:
+2.8% to +6.3%
```

---

## 6.2 Vehicle-Specific Behavior Is More Valuable Than Generic Thresholds

A static rule such as:

```text
Coolant > 100°C = warning
```

is not acceptable.

Different engines intentionally operate at different temperatures.

Warnings should use:

```text
OEM limits
        +
vehicle configuration
        +
operating conditions
        +
historical baseline
```

whenever possible.

---

## 6.3 Never Claim More Capability Than Exists

BMWCenter must never say:

```text
BMW F30 fully supported
```

unless all relevant model/year/ECU combinations have been validated.

Instead:

```text
Detected capabilities

Generic OBD-II               Supported
DME enhanced data            Supported
EGS enhanced data            Supported
Battery registration         Supported
Coding                       Experimental
EPB service                  Not available
```

---

# 7. Diagnostic Capability Levels

All application features MUST belong to one of the following levels.

## Level 0 — Generic OBD-II

Standards-based diagnostics.

Examples:

```text
RPM
vehicle speed
coolant temperature
MAF
fuel trims
O2 sensors
generic DTC
freeze frame
Mode 6
readiness
VIN
```

---

## Level 1 — OEM Enhanced Read

Manufacturer-specific but read-only operations.

Examples:

```text
BMW DME values
BMW EGS values
DSC wheel speeds
battery IBS data
DPF soot level
transmission temperature
misfire counters
boost target
boost actual
```

---

## Level 2 — OEM Service Functions

Operations that intentionally modify service state.

Examples:

```text
service reset
battery registration
EPB service mode
DPF regeneration
fuel pump priming
TPMS initialization
```

These require explicit safety checks.

---

## Level 3 — Coding / Configuration

Vehicle configuration changes.

Examples:

```text
SPORT+
ASD disable
CarPlay fullscreen
lighting behavior
start/stop memory
needle sweep
comfort settings
```

These require:

```text
backup
verification
rollback strategy
audit trail
```

---

## Level 4 — Vehicle Intelligence

Analysis performed by BMWCenter.

Examples:

```text
baseline learning
drift detection
predictive warnings
vehicle health
cross-trip comparison
maintenance prediction
used-car anomaly detection
```

This is independent from OEM coding.

---

# 8. MVP Definition

The MVP MUST NOT attempt to deliver every planned feature.

The first production-quality version should establish a reliable diagnostic and vehicle-health foundation.

The MVP includes:

```text
Reliable BLE OBD connection
Adapter capability detection
Vehicle identification
Generic OBD capability detection
Live dashboard
DTC scanning
Freeze frame
Pending DTC
Permanent DTC
Mode 6
Readiness monitors
Automatic trip recording
Trip history
Fuel tracking
Vehicle health summary
Basic baseline learning
Vehicle event detection
Battery voltage trends
Maintenance tracking
Mechanic report
CSV export
GPX export
PDF report
Minimal CarPlay experience
Simulator/mock diagnostics
```

The MVP does NOT require:

```text
full BMW coding
VAG coding
Mercedes coding
Watch app
cloud account
fleet analytics
AI mechanic
social features
community PID marketplace
```

---

# 9. MVP Success Definition

The MVP is considered complete when a user can:

1. Install BMWCenter.
2. Connect a supported BLE OBD adapter.
3. Identify the vehicle.
4. See what the adapter supports.
5. See what the vehicle supports.
6. View real-time OBD data.
7. Scan diagnostic trouble codes.
8. Understand the meaning of a diagnostic issue.
9. See freeze-frame information when available.
10. See emissions/readiness state.
11. Automatically record a trip.
12. Review trip statistics.
13. Review vehicle health.
14. See meaningful anomaly warnings.
15. Track maintenance.
16. Export data for a mechanic.
17. Use a minimal safe CarPlay view while driving.

---

# 10. Required Engineering Phase Before Feature Development

The project currently has no Git repository.

This MUST be fixed before significant ECU functionality is implemented.

Create:

```text
.gitignore
README.md
ARCHITECTURE.md
ROADMAP.md
SAFETY.md
SUPPORTED_ADAPTERS.md
SUPPORTED_VEHICLES.md
DATA_DICTIONARY.md
PRIVACY.md
RELEASE.md
```

Initialize Git.

Initial commits should logically separate:

```text
baseline
architecture refactor
transport improvements
diagnostics
health engine
BMW enhanced diagnostics
```

Never mix large unrelated changes into one implementation step.

---

# 11. Proposed Architecture

Refactor the architecture toward:

```text
BMWCenter
│
├── App
│
├── Core
│   │
│   ├── VehicleCommunication
│   │   ├── Transport
│   │   ├── Adapter
│   │   ├── Protocol
│   │   ├── Session
│   │   └── Scheduler
│   │
│   ├── Vehicle
│   │   ├── Identification
│   │   ├── Capabilities
│   │   ├── ECU
│   │   └── Profiles
│   │
│   ├── Diagnostics
│   │   ├── GenericOBD
│   │   ├── DTC
│   │   ├── FreezeFrame
│   │   ├── Mode6
│   │   └── Readiness
│   │
│   ├── OEM
│   │   ├── BMW
│   │   ├── VAG
│   │   ├── Ford
│   │   ├── Toyota
│   │   ├── Mercedes
│   │   ├── HyundaiKia
│   │   └── ...
│   │
│   ├── Telemetry
│   │
│   ├── VehicleHealth
│   │   ├── Baseline
│   │   ├── Anomaly
│   │   ├── Events
│   │   └── Scoring
│   │
│   ├── Trip
│   ├── Fuel
│   ├── Maintenance
│   ├── Performance
│   ├── Reports
│   ├── Storage
│   └── Settings
│
├── Phone
├── CarPlay
├── Watch
├── Widgets
└── Tests
```

---

# 12. Transport Architecture

The transport layer MUST NOT be tightly coupled to ELM327.

Define a generic transport abstraction.

Conceptual Swift API:

```swift
protocol VehicleTransport: Sendable {
    var identifier: String { get }
    var state: VehicleTransportState { get }

    func connect() async throws
    func disconnect() async

    func send(_ request: TransportRequest) async throws -> TransportResponse
}
```

Possible implementations:

```text
ELM327BLETransport
STNBLETransport
BMWENETTransport
DoIPTransport
MockVehicleTransport
ReplayTransport
```

The rest of the application MUST NOT know whether bytes came from Bluetooth, Ethernet or a simulator.

---

# 13. Adapter Layer

Create an adapter abstraction above transport.

```swift
protocol VehicleAdapter {
    var identity: AdapterIdentity { get }
    var capabilities: AdapterCapabilities { get }

    func initialize() async throws
    func probeCapabilities() async throws -> AdapterCapabilities
}
```

Example capability model:

```swift
struct AdapterCapabilities: OptionSet {
    let rawValue: UInt64

    static let genericOBD
    static let can11Bit
    static let can29Bit
    static let iso9141
    static let kwp2000
    static let j1850
    static let customHeaders
    static let canFlowControl
    static let longMessages
    static let multiFrame
    static let extendedAddressing
    static let msCAN
    static let swCAN
    static let highSpeedPolling
}
```

Do not assume capability from adapter name alone.

Probe when possible.

---

# 14. ELM327 Initialization

ELM initialization must be implemented as a state machine.

Typical initialization sequence may include:

```text
connect BLE
detect characteristic
enable notifications
ATZ
wait for reset
ATE0
ATL0
ATS0
ATSP0
probe vehicle
probe protocol
read adapter voltage
validate response parsing
```

Commands such as:

```text
ATH1
ATAL
ATCAF
ATSH
ATCRA
ATFCSH
ATFCSD
```

must NOT be globally applied without understanding the protocol/session requirement.

Configuration must be session-specific.

---

# 15. ELM327 Response Parser

The parser MUST tolerate:

```text
>
SEARCHING...
NO DATA
STOPPED
?
CAN ERROR
UNABLE TO CONNECT
BUS INIT...
BUFFER FULL
BUS ERROR
```

It must also tolerate:

```text
spaces
line breaks
echo
missing echo
uppercase
lowercase
multi-frame CAN responses
adapter banners
delayed prompt characters
```

Parser responsibilities:

```text
raw transport bytes
        ↓
ELM framing
        ↓
hex normalization
        ↓
CAN/ISO-TP reconstruction
        ↓
OBD response
```

Keep each stage testable separately.

---

# 16. Command Queue

ELM327 adapters generally cannot process arbitrary parallel requests.

All commands MUST pass through a serialized command scheduler.

Recommended design:

```swift
actor OBDCommandScheduler {
    // exactly one command in flight per adapter/session
}
```

Each command requires:

```text
request identifier
priority
timeout
retry policy
expected response format
cancellation support
```

Priorities:

```text
P0 safety-critical live data
P1 active diagnostic request
P2 dashboard telemetry
P3 trip telemetry
P4 background health collection
P5 optional enrichment data
```

When bandwidth becomes limited, lower priorities MUST be throttled first.

---

# 17. Polling Scheduler

Do not hard-code one refresh rate for every PID.

Define:

```text
Critical
Fast
Normal
Slow
VerySlow
OnDemand
```

Example:

```text
RPM                  Fast
Vehicle speed        Fast
Throttle             Fast
Boost                Fast
Coolant              Normal
Fuel trim            Normal
Battery voltage      Normal
VIN                  OnDemand
DTC scan             OnDemand
Readiness            VerySlow
```

Actual rate MUST depend on adapter throughput.

The application must measure:

```text
average response latency
timeout rate
commands per second
bytes per second
```

and dynamically reduce polling if necessary.

---

# 18. Generic OBD-II Support

Implement generic diagnostics as a standalone module.

Primary modes:

```text
Mode 01 — Current Powertrain Data
Mode 02 — Freeze Frame
Mode 03 — Stored DTC
Mode 04 — Clear DTC
Mode 06 — On-board Monitoring Test Results
Mode 07 — Pending DTC
Mode 09 — Vehicle Information
Mode 0A — Permanent DTC
```

Do not mix these with OEM-specific diagnostics.

---

# 19. Generic PID Registry

Create a central PID definition structure.

Example:

```swift
struct PIDDefinition {
    let mode: UInt8
    let pid: UInt8
    let name: String
    let unit: UnitDefinition?
    let byteCount: Int?
    let decoder: PIDDecoder
    let preferredPollingClass: PollingClass
}
```

Example registry entry:

```text
Mode: 01
PID: 0C
Name: Engine RPM
Formula:
((A * 256) + B) / 4
Unit: rpm
```

Do not duplicate decoding formulas inside view models.

---

# 20. Supported PID Discovery

At connection time, discover supported generic PIDs using standard support bitmaps.

Store discovered capabilities per vehicle.

Avoid repeatedly probing the same capabilities during every trip.

Persist:

```text
VIN
protocol
supported PID bitmap
adapter identifier
last validation date
```

Revalidate after:

```text
adapter changes
vehicle changes
major application updates
protocol errors
```

---

# 21. Vehicle Identification

Vehicle identification hierarchy:

```text
VIN via Mode 09
        ↓
OEM VIN source if available
        ↓
manual vehicle selection
```

Vehicle profile:

```text
VIN
manufacturer
model
generation
model year
engine
fuel type
transmission
drivetrain
body
market
engine code
ECU architecture
```

Not every field will always be available.

Every field must include provenance:

```text
VIN-decoded
OEM-read
user-entered
inferred
unknown
```

---

# 22. Capability Engine

This is one of the most important architectural components.

Feature availability is the intersection of:

```text
Application implementation
        ∩
Vehicle support
        ∩
ECU availability
        ∩
Adapter support
        ∩
Transport support
        ∩
Security authorization
```

Never use:

```swift
if vehicle.brand == .bmw {
    showBatteryRegistration = true
}
```

Instead:

```swift
capabilityResolver.resolve(
    feature: .batteryRegistration,
    vehicle: vehicle,
    adapter: adapter,
    session: session
)
```

---

# 23. Capability States

Capabilities MUST support more states than Boolean true/false.

Use:

```text
supported
unsupported
notApplicable
blockedByAdapter
blockedByTransport
blockedBySecurity
requiresAdditionalHardware
experimental
unknown
```

Example UI:

```text
Battery Registration

Supported by vehicle
Unavailable with current adapter

Required:
BMW enhanced diagnostic transport
```

This is significantly better than:

```text
Feature not supported
```

---

# 24. Capability Scan Screen

After connection:

```text
BMW 316i
F30
2014
N13

Connection
✓ CAN detected
✓ VIN detected
✓ Generic OBD
✓ DME detected

Capabilities

Generic Diagnostics        ✓
Live Data                  ✓
Freeze Frame                ✓
Mode 6                      ✓
Enhanced BMW Engine Data    ✓
Transmission Data           ?
Battery Registration        Adapter required
Coding                      Not installed
EV Battery                  Not applicable
```

---

# 25. Main Application Information Architecture

Recommended phone tabs:

```text
Home
Live
Health
Trips
Garage
```

Diagnostics should be accessible from Home/Health rather than consuming another permanent tab unless UX testing demonstrates otherwise.

---

# 26. Home Screen

Home should answer:

> What is happening with my car right now?

Example:

```text
BMW 316i
169,240 km

Vehicle Health
87 / 100
GOOD

Engine
Good

Cooling
Good

Battery
Watch

Emissions
Ready

Diagnostics
No active engine faults

Last trip
32.8 km
7.3 L/100 km

Next maintenance
Engine oil
1,420 km
```

Primary actions:

```text
Scan Vehicle
Start Live Data
View Health
```

---

# 27. Vehicle Health

This should become one of BMWCenter's primary differentiators.

Health categories:

```text
Engine
Cooling
Fuel/Air
Ignition
Turbo
Transmission
Battery/Electrical
Emissions
DPF
Hybrid/EV Battery
Brakes
Sensors
```

Not every vehicle exposes every category.

---

# 28. Health Score

The score should NOT be fake.

A category with no usable data should show:

```text
Not enough data
```

instead of:

```text
100%
```

Health score inputs can include:

```text
active DTC severity
pending DTC
permanent DTC
sensor anomalies
historical drift
Mode 6 margin
battery voltage trend
OEM health values
maintenance status
```

Each contribution must be traceable.

---

# 29. Explainable Health

Every health score change must have reasons.

Example:

```text
Battery
72 / 100

Why?

- Lowest startup voltage decreased from 11.2 V to 10.6 V.
- Three low-voltage events detected during the last seven starts.
- Charging voltage remains normal.
```

Never display unexplained AI-generated scores.

---

# 30. Vehicle Health Scan

Create a single primary action:

# Scan Vehicle

Generic scan flow:

```text
connection health
VIN
supported PIDs
MIL status
stored DTC
pending DTC
permanent DTC
freeze frame
Mode 6
readiness
battery voltage
sensor plausibility
```

OEM scan may additionally inspect:

```text
ECU inventory
manufacturer DTCs
manufacturer live values
service status
```

---

# 31. Scan Result

Example:

```text
Vehicle Scan

Overall
Good

Engine ECU
No active faults

Pending faults
1

Battery
Voltage trend requires attention

Emissions
7 / 8 monitors ready

Sensors
No implausible values

New since previous scan
P0171 pending
```

Users should be able to compare two scans.

---

# 32. Scan History

Persist scans.

Allow comparison:

```text
Scan A
2026-08-01

Scan B
2026-08-07
```

Highlight:

```text
new DTC
cleared DTC
readiness changes
battery trend
new ECU
missing ECU
new anomalies
```

---

# 33. DTC Model

Each DTC record should include:

```text
code
type
ECU
description
severity
status
first seen
last seen
occurrence count
freeze frame
related sensor data
user notes
cleared date
```

DTC type:

```text
stored
pending
permanent
OEM
```

---

# 34. DTC Experience

Do not show only:

```text
P0299
Turbo/Super Charger Underboost
```

Show:

```text
P0299

Turbo pressure lower than expected

Status
Pending

Severity
High

First detected
2026-08-04

Detected
3 times

Current vehicle state
No active MIL

Possible systems to inspect
- charge-air leaks
- boost control
- wastegate
- boost pressure sensor

Recorded conditions
RPM: 3,120
Load: 84%
Coolant: 97°C
```

Do not claim one definite repair unless diagnostic evidence supports it.

---

# 35. Clearing DTC

Clearing codes is a destructive diagnostic operation.

Before performing Mode 04:

```text
Explain that diagnostic history may be removed.
Explain that emissions readiness monitors can reset.
Explain that permanent DTCs may remain.
Require explicit confirmation.
```

DTC clearing must NEVER be available from CarPlay.

---

# 36. Freeze Frame

Decode freeze-frame information into human-readable values.

Provide:

```text
timestamp if known
DTC
RPM
load
speed
coolant
fuel trims
MAP
MAF
throttle
```

Only display values actually available.

---

# 37. Mode 6

Mode 6 is an important differentiating feature.

Store:

```text
monitor
test
current value
minimum
maximum
pass/fail
distance from limit
```

Example:

```text
Catalyst Monitor

Current
0.74

Maximum allowed
0.80

Margin
7.5%

Status
Close to threshold
```

A value approaching a threshold should produce a caution, not a diagnosis.

---

# 38. Emissions Readiness

Provide a dedicated readiness view:

```text
Misfire           Ready
Fuel System       Ready
Comprehensive     Ready
Catalyst          Ready
O2 Sensor         Ready
O2 Heater         Ready
EVAP              Not Ready
```

Explain what "Not Ready" means.

Do not label it as a fault automatically.

---

# 39. Live Dashboard

Dashboard must be configurable.

Possible cards:

```text
RPM
speed
coolant
oil temperature
boost
battery
MAF
MAP
IAT
STFT
LTFT
lambda
fuel pressure
engine load
throttle
fuel rate
transmission temperature
```

Unsupported metrics should not appear by default.

---

# 40. Dashboard Profiles

Users can create presets:

```text
Daily
Performance
Cooling
Fuel
Diagnostics
Turbo
Transmission
```

Example Performance profile:

```text
RPM
Boost Target
Boost Actual
IAT
Ignition
Lambda
Fuel Pressure
```

---

# 41. Graphs

Live graph must support:

```text
1 sensor
2 sensors
4 sensors
```

with synchronized time axis.

Features:

```text
pause
resume
zoom
cursor
min
max
average
event markers
DTC markers
```

Do not attempt to graph dozens of sensors simultaneously on mobile.

---

# 42. Data Quality

Every telemetry reading should carry:

```text
timestamp
sensor ID
value
unit
quality
source
```

Quality examples:

```text
valid
stale
estimated
derived
unsupported
invalid
```

UI should never treat stale readings as live.

---

# 43. Derived Metrics

Some metrics may be calculated.

Examples:

```text
boost pressure
estimated fuel consumption
acceleration
warm-up duration
fuel economy
battery trend
```

Every derived sensor must define:

```text
input sensors
formula/version
minimum data quality
confidence
```

---

# 44. Fuel Consumption

Fuel calculation source priority:

```text
1. OEM fuel consumption/fuel injection value
2. SAE fuel-rate PID if available
3. MAF-based calculation
4. user calibration
```

Never pretend estimated fuel consumption is ECU-measured.

Store:

```text
source = ecu
```

or:

```text
source = estimated
```

---

# 45. Fuel Calibration

Existing calibration functionality should be preserved.

After refueling:

```text
distance
calculated fuel
actual fuel added
```

Calculate correction factor.

Use smoothing so one incorrect fill-up does not destroy calibration.

Track calibration confidence.

---

# 46. Trip Recording

Trips should normally start automatically.

Inputs may include:

```text
RPM
vehicle speed
adapter state
ignition state if available
GPS movement
```

Use debounce logic.

Do not start a trip because of one transient RPM response.

---

# 47. Trip State Machine

Recommended states:

```text
idle
vehicleDetected
engineRunning
recording
possibleStop
finished
```

Example:

```text
idle
↓
RPM detected
↓
vehicleDetected
↓
RPM > 0 stable
↓
engineRunning
↓
recording
```

Trip stop should require stable engine-off/disconnection evidence.

---

# 48. Trip Data

Each trip:

```text
start time
end time
duration
distance
driving duration
idle duration
average speed
maximum speed
estimated fuel
average consumption
fuel cost
GPS route
maximum coolant
maximum oil temperature
maximum boost
warm-up duration
hard acceleration count
hard braking count
health events
DTC events
```

---

# 49. Trip Classification

Support:

```text
Personal
Business
Unclassified
```

Classification should be editable later.

CarPlay may provide two large actions:

```text
Personal
Business
```

No complex trip editing on CarPlay.

---

# 50. Trip Replay

A powerful post-MVP feature:

Allow users to replay a trip timeline.

Map position and telemetry should remain synchronized.

Example:

```text
12:42:18
Speed       92 km/h
RPM         2,430
Boost       0.61 bar
Coolant     96°C
IAT         39°C
```

Health events can be shown on the route.

---

# 51. Vehicle Baseline Engine

This is a strategic feature.

Instead of comparing only against universal thresholds, BMWCenter learns the user's individual vehicle.

Baseline dimensions may include:

```text
RPM
engine load
coolant state
vehicle speed
ambient/intake temperature
gear
warm/cold engine state
```

Data must be segmented by operating condition.

---

# 52. Baseline Cells

Example operating cell:

```text
RPM
1800–2200

Load
40–50%

Coolant
85–105°C

State
Warm engine
```

For each sensor store statistical state.

Example:

```text
sample count
mean
variance
min
max
last update
```

Welford's online algorithm is suitable because it updates mean and variance incrementally without retaining every raw reading.

---

# 53. Minimum Baseline Requirements

Do not issue anomaly warnings from insufficient data.

Example:

```text
samples < 10
No baseline

samples 10–30
Learning

samples 30–100
Low confidence

samples > 100
Established
```

Exact thresholds should remain configurable.

---

# 54. Baseline Sensors

Generic candidates:

```text
coolant
IAT
MAF
MAP
STFT
LTFT
lambda
RPM stability
battery voltage
engine load
```

OEM candidates:

```text
boost target vs actual
fuel rail target vs actual
misfire counters
ignition correction
water pump speed
thermostat target
transmission slip
DPF differential pressure
battery IBS
```

---

# 55. Anomaly Detection

Do not flag every statistical deviation.

Anomaly system should consider:

```text
magnitude
duration
repetition
operating state
sensor quality
baseline confidence
correlated sensors
```

Conceptual anomaly score:

```text
deviation score
×
persistence
×
baseline confidence
×
sensor confidence
```

---

# 56. Hysteresis

Health events require hysteresis.

Bad:

```text
value abnormal
→ alert
value normal
→ clear
value abnormal
→ alert
```

Better:

```text
candidate anomaly
↓
persist for N samples
↓
event starts
↓
value normal for recovery window
↓
event closes
```

This prevents notification spam.

---

# 57. Event Detection

Examples:

```text
cold engine high load
coolant overheating
abnormal warm-up duration
boost deviation
fuel trim drift
battery low-voltage startup
high transmission temperature
excessive intake temperature
persistent misfire
abnormal DPF regeneration frequency
```

Event definitions should live in a registry rather than UI code.

---

# 58. Predictive Alerts

BMWCenter should not claim:

```text
Your thermostat will fail next week.
```

Instead:

```text
Engine warm-up time has increased by 34% compared with your normal baseline.

This behavior can occur when the cooling system or thermostat is not operating
as previously observed.

Monitor the trend or have the cooling system inspected.
```

This keeps the analysis explainable.

---

# 59. Battery Monitoring

Generic ELM voltage should primarily be treated as a voltage trend.

Possible generic metrics:

```text
engine-off voltage
startup dip
charging voltage
minimum voltage
average charging voltage
```

Do not calculate a precise battery State of Health percentage from ELM voltage alone.

If BMW IBS or equivalent OEM battery-management data is available, OEM SOC/SOH information may be shown separately.

---

# 60. Warm-Up Analysis

Track:

```text
start coolant temperature
ambient/IAT
time to 70°C
time to 80°C
time to normal operating region
average load
vehicle speed
```

Compare with historical trips under similar ambient conditions.

Potential alert:

```text
Warm-up duration is significantly longer than your vehicle's historical baseline.
```

Useful for detecting thermostat behavior changes.

---

# 61. Turbo Health

Where required sensors are available:

```text
boost target
boost actual
RPM
load
throttle
IAT
wastegate position if OEM
```

Calculate:

```text
target deviation
response delay
overshoot
undershoot
```

Only compare samples where turbo demand is meaningful.

Do not evaluate boost behavior at idle.

---

# 62. Fuel Trim Health

Track STFT and LTFT under operating regions:

```text
idle
low load
cruise
medium load
```

This is more useful than a single global mean.

Example:

```text
Idle LTFT
historical: +2% to +5%
current: +11%

Cruise LTFT
historical: +1% to +4%
current: +3%
```

This pattern can be useful without automatically claiming a specific leak.

---

# 63. Mechanic Report

Add:

# Send to Mechanic

Generate a structured PDF.

Contents:

```text
Vehicle
VIN
model
engine if known
odometer if known

Scan Summary

Stored DTC
Pending DTC
Permanent DTC
OEM DTC

Freeze Frame

Vehicle Health

Recent anomalies

Battery trend

Relevant graphs

Maintenance history

User notes
```

Allow CSV/JSON attachment export separately.

---

# 64. Mechanic Report Safety

The report should distinguish:

```text
ECU-provided information
BMWCenter-derived information
user-entered information
```

Example:

```text
BMWCenter observation:
Boost response deviated from learned baseline by 14%.

This is not an ECU diagnostic code.
```

---

# 65. Maintenance Module

Maintenance must become a major product area.

Items:

```text
Engine Oil
Oil Filter
Air Filter
Cabin Filter
Spark Plugs
Ignition Coils
Coolant
Brake Fluid
Front Pads
Rear Pads
Brake Discs
Transmission Oil
Differential Oil
Battery
Timing Components
DPF
AdBlue
Tires
```

---

# 66. Maintenance Record

Fields:

```text
type
date
odometer
provider
part brand
part number
quantity
price
currency
labor cost
notes
invoice image
attachments
```

---

# 67. Maintenance Rules

Service scheduling may use:

```text
distance
time
OEM CBS data
vehicle model
user-defined interval
condition estimate
```

User-defined values override general recommendations.

---

# 68. Ownership Cost

Post-MVP:

```text
Fuel
Maintenance
Repairs
Tires
Insurance
Tax
Other
```

Calculate:

```text
total monthly cost
annual cost
cost/km
```

This provides value even when the OBD adapter is disconnected.

---

# 69. Used Car Check

Used Car Check should become a premium workflow.

It must NOT claim to provide a guaranteed inspection.

Workflow:

```text
Connect adapter
↓
Identify vehicle
↓
Full supported scan
↓
Read available mileage sources
↓
Read DTC
↓
Read readiness
↓
Read engine runtime
↓
Read battery data
↓
Read powertrain health
↓
Generate report
```

---

# 70. Used Car Mileage Analysis

If OEM access allows reading odometer-related values from several modules:

```text
instrument cluster
engine ECU
transmission
body module
key/CAS equivalent
service history values
```

compare them.

Do NOT state:

```text
Mileage has been rolled back.
```

from one mismatch.

Say:

```text
Mileage inconsistency detected between modules.

Additional inspection is recommended.
```

Use tolerances because ECUs may update odometer values at different intervals.

---

# 71. Used Car Report Categories

Example:

```text
Identity
✓ VIN consistent

Diagnostics
⚠ 2 stored faults

Mileage consistency
⚠ Requires inspection

Emissions
✓ Ready

Battery
⚠ Startup voltage low

Engine behavior
✓ No major anomaly

Transmission
Not available with current adapter
```

---

# 72. Performance Mode

Post-MVP enthusiast feature.

Measurements:

```text
0–50 km/h
0–100 km/h
80–120 km/h
100–200 km/h
60–130 mph
1/8 mile
1/4 mile
```

Use:

```text
GPS
vehicle speed PID
accelerometer
```

with data-quality indicators.

Do not market smartphone/OBD timing as professional drag-strip timing.

---

# 73. Performance Logging

During performance sessions prioritize:

```text
RPM
speed
gear
boost target
boost actual
IAT
lambda
ignition
fuel pressure
throttle
```

Reduce low-priority telemetry.

---

# 74. Run Comparison

Allow:

```text
Run A
Run B
```

Comparison example:

```text
0–100
8.4 s → 8.0 s

Max IAT
48°C → 41°C

Boost peak
1.03 bar → 1.08 bar
```

Graph both sessions.

---

# 75. Custom PID Engine

Post-MVP but strategically important.

Custom PID definition:

```json
{
  "id": "custom.sensor.example",
  "name": "Example Sensor",
  "protocol": "uds",
  "ecu": "DME",
  "request": "22F190",
  "responsePrefix": "62F190",
  "unit": "raw",
  "pollingClass": "normal",
  "decoder": {
    "type": "formula",
    "formula": "..."
  }
}
```

Do NOT allow arbitrary untrusted executable Swift/JavaScript code.

Formula language should be constrained.

---

# 76. PID Pack Concept

Future packs:

```text
BMW N13
BMW N20
BMW B48
BMW B58
BMW B47
BMW B57

VAG EA888
VAG EA211
VAG TDI

Toyota Hybrid
Ford EcoBoost
Hyundai/Kia EV
```

Each pack should be versioned.

---

# 77. PID Pack Metadata

```text
pack ID
version
manufacturer
platform
engine family
model years
required protocol
required adapter capabilities
sensor definitions
validation vehicle list
```

---

# 78. CarPlay Strategy

CarPlay must NOT mirror the complete phone application.

CarPlay should support only short driving-related interactions.

Recommended primary screen:

```text
BMWCenter

Engine
96°C

Oil
103°C

Battery
14.4V

Trip
32 km
7.1 L/100 km

Status
No warnings
```

---

# 79. Allowed CarPlay Interactions

Potential:

```text
Start Trip
Stop Trip
Personal
Business
Mute non-critical cues
Open minimal vehicle status
```

---

# 80. Forbidden CarPlay Operations

Do not expose:

```text
DTC clear
ECU coding
battery registration
DPF regeneration
service reset
raw PID configuration
maintenance editing
detailed graphs
historical report editing
```

These belong on the phone.

---

# 81. CarPlay Alert Philosophy

Only genuinely driving-relevant warnings should interrupt.

Examples:

```text
Severe coolant temperature
critical oil condition if available
critical electrical condition
severe transmission temperature
```

Do not show:

```text
badge earned
maintenance article
fuel analytics
minor stored DTC
```

while driving.

---

# 82. Widgets

Widgets are post-MVP unless provisioning is resolved.

Useful widgets:

```text
Vehicle Health
Last Trip
Next Maintenance
Last Scan
Fuel Economy
```

Widgets should display cached data.

Do not attempt continuous BLE OBD communication from widgets.

---

# 83. Live Activities

Possible trip Live Activity:

```text
Trip
34 min
21.8 km
7.2 L/100 km
```

Avoid unnecessary high-frequency updates.

---

# 84. Apple Watch

Watch target should be completed only after core iPhone functionality stabilizes.

Watch MVP:

```text
connection state
vehicle health
current trip
trip start/stop
few live values
critical alerts
```

Watch should communicate primarily with the iPhone rather than independently reinventing OBD transport.

---

# 85. BMW OEM Strategy

BMW should be the first deep OEM implementation.

However architecture must remain brand-neutral.

Initial BMW work should prioritize:

```text
ECU discovery
read-only OEM telemetry
full DTC scan
maintenance/service data
safe service functions
coding last
```

Do NOT start by implementing coding.

---

# 86. BMW ECU Domains

Potential ECU domains include:

```text
DME / DDE
EGS
DSC
ACSM
FEM
BDC
CAS on applicable platforms
KOMBI
IHKA
EPS
REM
FRM on older vehicles
EME on electrified vehicles
SME / battery-related modules
```

Exact module names vary by generation.

Do not assume every vehicle contains every module.

---

# 87. BMW Engine Data

Potential enhanced values:

```text
oil temperature
coolant temperature
boost target
boost actual
charge pressure
intake temperature
rail pressure target
rail pressure actual
lambda
fuel trims
injection correction
misfire counters
ignition correction
throttle
wastegate position
water pump request
water pump speed
thermostat target
fan request
```

Availability must be determined by ECU/software version.

---

# 88. BMW Transmission Data

Potential:

```text
current gear
requested gear
oil temperature
input speed
output speed
torque converter state
torque converter slip
clutch values where available
adaptation values where safely readable
```

Read-only first.

---

# 89. BMW Diesel Features

Potential:

```text
DPF soot mass
DPF ash
differential pressure
exhaust temperatures
distance since regeneration
time since regeneration
regeneration state
regeneration request
```

Forced regeneration is a service action and requires additional safeguards.

---

# 90. BMW Electrical Features

Potential:

```text
battery voltage
IBS current
IBS SOC
IBS temperature
charging status
registered battery capacity
battery type
energy management events
```

---

# 91. BMW Battery Registration

Post-read-only BMW phase.

Workflow:

```text
Identify vehicle
↓
Read current battery configuration
↓
Ask replacement battery details
↓
Validate supported battery type/capacity
↓
Check voltage
↓
Check engine/ignition state
↓
Perform registration
↓
Verify
↓
Record audit event
```

Do not perform registration if required ECU state cannot be verified.

---

# 92. BMW CBS / Service Reset

Potential supported services:

```text
engine oil
brake fluid
vehicle check
front brake
rear brake
inspection items
```

Exact capabilities vary.

Read existing service status before offering reset.

---

# 93. BMW EPB Service

Where supported:

```text
enter service mode
confirm success
user performs maintenance
exit service mode
verify
```

Provide explicit instructions and warnings.

Do not automatically execute multi-stage workshop operations without confirmation.

---

# 94. BMW Fuel Pump Priming

Treat as workshop/service feature.

Preconditions must be known.

Log start/end result.

Do not expose through CarPlay.

---

# 95. BMW Exhaust Flap

Where supported, this may be a user-facing control.

Safety rules:

```text
vehicle compatibility validated
state readable if possible
restore default when session ends
avoid permanent unknown ECU state
```

---

# 96. BMW Active Sound Design

Potential one-click feature later.

Treat as configuration.

Always read current value first.

---

# 97. BMW Coding

Coding is a separate later milestone.

Coding engine requirements:

```text
read original configuration
create backup
decode supported parameter
validate requested value
write
read back
verify
record change
rollback when possible
```

Never blindly write known offsets from another vehicle.

---

# 98. BMW Coding UI

User-facing coding should be descriptive.

Bad:

```text
HU_NBT > 3000 > XYZ_BITMASK
```

Better:

```text
Full-Screen CarPlay

Current
Disabled

Requested
Enabled
```

Expert raw view may be added separately.

---

# 99. BMW Coding Backup

Before every coding session store:

```text
VIN
ECU
ECU software identifier
timestamp
configuration snapshot
changed parameters
app version
```

Backup must be immutable.

---

# 100. BMW EV/PHEV

Add a dedicated electrified-vehicle module.

Possible data:

```text
HV battery SOC
HV battery SOH if ECU exposes it
usable energy
gross energy
cell voltages
min cell
max cell
cell delta
module temperatures
battery current
battery voltage
motor power
regen power
charging power
battery inlet temperature
charge session data
```

---

# 101. EV Health

Do not calculate fake SOH if the vehicle does not expose sufficient data.

Possible display:

```text
Battery

ECU-reported SOH
92%

Cell delta
13 mV

Maximum temperature
34°C

Temperature spread
3°C
```

Clearly identify ECU-reported vs estimated values.

---

# 102. EV Charging Analysis

Future feature:

```text
SOC
power
battery temperature
time
```

Create charging curves.

Compare multiple sessions.

Useful for detecting:

```text
thermal throttling
reduced peak charging
unusual battery heating
```

---

# 103. Brand Plugin Architecture

Define OEM providers.

Concept:

```swift
protocol OEMProvider {
    var brand: VehicleBrand { get }

    func identifyVehicle(
        session: DiagnosticSession
    ) async throws -> OEMVehicleIdentity?

    func discoverECUs(
        session: DiagnosticSession
    ) async throws -> [ECUDescriptor]

    func capabilities(
        vehicle: VehicleProfile,
        adapter: AdapterCapabilities
    ) async -> [VehicleCapability]
}
```

Feature-specific protocols may include:

```text
OEMDiagnosticProvider
OEMLiveDataProvider
OEMServiceProvider
OEMCodingProvider
OEMEVProvider
```

Do not build a monolithic `BMWService` and then copy it for other manufacturers.

---

# 104. Volkswagen Group Strategy

Brands:

```text
Volkswagen
Audi
SEAT
Skoda
Cupra
```

Potential features:

```text
full ECU scan
OEM live data
oil service reset
inspection reset
EPB service
battery adaptation
TPMS
DPF data
DPF service
adaptation channels
basic settings
coding
long coding
gateway configuration
```

Start read-only.

---

# 105. VAG Security

Modern vehicles may use:

```text
SFD
SFD2
secure gateways
UNECE-related protections
```

BMWCenter must never attempt to bypass these systems.

Capability status should report:

```text
blockedBySecurity
```

where appropriate.

Only officially supported authorization methods may be considered in future integrations.

---

# 106. Ford / Lincoln Strategy

Potential support:

```text
PCM
TCM
ABS
SRS
BCM
instrument cluster
4WD modules
TPMS
BMS
EPB
DPF
service functions
```

Ford may require access to different CAN networks.

Adapter capabilities matter significantly.

---

# 107. Ford CAN Networks

Some Ford vehicles use:

```text
HS-CAN
MS-CAN
```

Do not assume generic BLE ELM hardware can access both.

Capability Engine should return:

```text
Vehicle supports BCM access
Current adapter cannot access required CAN network
```

---

# 108. Ford Configuration

Advanced future capability:

```text
As-Built configuration
module backups
supported parameter changes
```

This must be implemented after read-only diagnostics and service functions.

Backup is mandatory.

---

# 109. Toyota / Lexus Strategy

High-value areas:

```text
full diagnostics
ABS
SRS
transmission
TPMS
service
hybrid battery
EV battery
```

Toyota/Lexus hybrid health can be a major differentiator.

---

# 110. Toyota Hybrid Battery

Potential data:

```text
battery block voltages
battery temperatures
SOC
battery current
voltage delta
fan status
internal resistance if exposed
```

Create:

# Hybrid Battery Health

Example:

```text
Maximum block
15.42 V

Minimum block
14.82 V

Delta
0.60 V

Status
High imbalance detected
```

Thresholds must be vehicle-specific.

---

# 111. Mercedes-Benz Strategy

Prioritize:

```text
read-only diagnostics
engine
transmission
ABS
SRS
battery
DPF
service information
```

Modern Mercedes platforms have increasingly restrictive security systems.

Do not promise coding coverage until validated.

---

# 112. Hyundai / Kia / Genesis

Potential:

```text
engine
TCM
ABS
SRS
BCM
TPMS
EPB
DCT temperature
clutch temperature
hybrid system
EV battery
DPF
battery systems
```

EV health is particularly relevant.

---

# 113. Stellantis

Brands may include:

```text
Fiat
Alfa Romeo
Jeep
Dodge
RAM
Chrysler
Peugeot
Citroën
Opel
DS
```

Modern vehicles may use Secure Gateway systems.

Never bypass SGW security.

Support must explicitly distinguish:

```text
read-only available
authorized service available
security blocked
```

---

# 114. GM

Potential:

```text
engine
transmission
ABS
SRS
BCM
TPMS
battery
fuel trims
misfire data
service functions
```

Some vehicles use additional CAN buses or proprietary diagnostics.

Again, adapter capability detection is required.

---

# 115. Nissan / Infiniti

Potential:

```text
engine
CVT
ABS
SRS
BCM
TPMS
EV battery
```

Nissan Leaf battery health may eventually become a dedicated EV module.

---

# 116. Mazda

Potential:

```text
engine
transmission
ABS
SRS
body
DPF
battery
service
```

Some architectures overlap conceptually with Ford-era systems but must not be assumed identical.

---

# 117. Adapter Compatibility Database

Create a local adapter registry.

Fields:

```text
manufacturer
model
firmware
BLE service
BLE characteristic
known chipset
capabilities
known limitations
minimum app version
validation status
```

---

# 118. Adapter Quality Test

When connecting an unknown adapter, optionally run a benchmark.

Measure:

```text
command latency
timeout rate
multi-frame stability
CAN header support
long-message support
notification reliability
```

Classify:

```text
Excellent
Good
Limited
Unstable
Unknown
```

Do not simply reject unknown ELM327 clones unless necessary.

---

# 119. Adapter Health UI

Example:

```text
OBD Adapter

Protocol
ISO 15765-4 CAN

Average response
62 ms

Timeout rate
0.4%

Enhanced BMW support
Limited

Connection quality
Good
```

---

# 120. Diagnostic Session

Create a session abstraction.

```text
transport
adapter
vehicle
protocol
capabilities
scheduler
state
```

Possible states:

```text
disconnected
connecting
adapterInitializing
vehicleDetecting
ready
degraded
reconnecting
failed
```

All UI should derive connection state from this single session state.

---

# 121. Reconnection Strategy

When BLE disconnects:

```text
preserve trip state temporarily
stop outgoing commands
attempt controlled reconnect
restore session
re-probe if necessary
resume telemetry
```

Do not immediately end a trip because of a one-second BLE interruption.

---

# 122. Offline Operation

Core diagnostics should not require Internet access.

Must work offline:

```text
OBD connection
dashboard
DTC database
trip recording
health analysis
maintenance
exports
BMW enhanced diagnostics where local definitions exist
```

Internet should be optional for future:

```text
cloud backup
community database
AI mechanic
fleet comparison
catalog updates
```

---

# 123. Storage Architecture

Primary storage remains SwiftData.

Recommended entities:

```text
VehicleEntity
AdapterEntity
VehicleCapabilityEntity
ECUEntity
ScanEntity
DTCEventEntity
FreezeFrameEntity
TripEntity
TelemetrySummaryEntity
TelemetryChunkEntity
HealthSnapshotEntity
HealthEventEntity
BaselineCellEntity
MaintenanceRecordEntity
FuelRecordEntity
CalibrationEntity
CodingBackupEntity
ServiceActionEntity
```

---

# 124. Raw Telemetry Storage

Do not store every reading forever without a retention strategy.

Possible strategy:

```text
Recent trips:
full-resolution

Older trips:
downsampled

Very old trips:
summary only
```

Example:

```text
0–30 days
full telemetry

30–180 days
1-second aggregate

>180 days
trip summary + health events
```

Make retention configurable.

---

# 125. Telemetry Chunking

Do not create millions of SwiftData rows if each sample can be grouped efficiently.

Consider chunk-based storage:

```text
TelemetryChunk
tripID
sensorID
startTime
sampleInterval
compressedValues
```

Benchmark before changing the existing implementation.

---

# 126. Data Versioning

Every stored derived result must include algorithm version.

Example:

```text
baselineAlgorithmVersion = 2
healthScoreVersion = 3
fuelFormulaVersion = 1
```

This allows recalculation after algorithm changes.

---

# 127. Export

Supported MVP formats:

```text
CSV
GPX
PDF
```

Future:

```text
JSON
ZIP diagnostic bundle
```

---

# 128. Diagnostic Bundle

Future export:

```text
vehicle.json
scan.json
dtc.json
trip.csv
telemetry.csv
health.json
report.pdf
```

Useful for:

```text
support
mechanics
developers
research
```

VIN redaction option should be available.

---

# 129. Privacy

BMWCenter should be local-first.

Sensitive data may include:

```text
VIN
GPS routes
home/work locations
driving patterns
vehicle history
maintenance
diagnostics
```

Default:

```text
local device storage
```

Cloud sync must be opt-in.

---

# 130. Privacy Controls

Add:

```text
Delete all vehicle data
Delete trip history
Delete location history
Export my data
Disable location recording
Disable analytics
Redact VIN during export
```

---

# 131. Security

Store credentials/tokens in Keychain.

Do not store security credentials or service authorization information in plain SwiftData.

Never log:

```text
credentials
security tokens
private API keys
```

Production logs should support redaction.

---

# 132. Service Action Framework

Every ECU-writing service action MUST run through one common framework.

Definition:

```text
action ID
vehicle requirements
ECU requirements
adapter requirements
transport requirements
preconditions
steps
verification
rollback capability
risk level
```

---

# 133. Service Preconditions

Possible:

```text
engine stopped
engine running
ignition on
vehicle stationary
parking brake active
battery voltage > threshold
doors closed
transmission in Park
```

Requirements vary per operation.

Never apply one universal set.

---

# 134. Service Action Flow

```text
User selects action
↓
Capability check
↓
Precondition check
↓
Explain action
↓
Explicit confirmation
↓
Execute
↓
Read back state
↓
Verify
↓
Store audit result
```

---

# 135. Service Action Audit

Persist:

```text
VIN
action
timestamp
previous state
requested state
result
verification result
app version
adapter
```

This is critical for support.

---

# 136. Coding Framework

Coding is more dangerous than service reset.

Architecture:

```text
CodingDefinition
CodingSession
CodingBackup
CodingChange
CodingValidator
CodingWriter
CodingVerifier
CodingRollback
```

Do not mix coding functions into generic diagnostics classes.

---

# 137. Coding Safety Levels

Suggested:

```text
Low
Medium
High
Expert
```

Example:

```text
ASD preference
Low/Medium

critical ECU coding
High/Expert
```

High-risk operations can remain unsupported initially.

---

# 138. AI Mechanic — Future

AI should NOT be part of the first MVP.

When implemented, AI should receive structured vehicle context.

Example context:

```json
{
  "vehicle": {},
  "activeDTC": [],
  "pendingDTC": [],
  "healthEvents": [],
  "recentTelemetrySummary": {},
  "maintenance": []
}
```

---

# 139. AI Mechanic Rules

AI must:

```text
explain evidence
reference current vehicle data
differentiate observation from hypothesis
avoid definitive repair claims without evidence
```

AI must NOT autonomously:

```text
clear DTC
perform coding
perform service action
start DPF regeneration
write ECU values
```

AI tools should remain read-only.

---

# 140. "What's Happening?" Feature

Before full conversational AI, build deterministic explanations.

Example:

```text
Why is my idle high?

Engine coolant:
38°C

Engine state:
Cold start

Observation:
Higher idle is expected during initial warm-up.

Current behavior:
Within learned baseline.
```

This can provide major value without cloud AI.

---

# 141. User Notifications

Categories:

```text
Critical
Important
Informational
Maintenance
```

Critical:

```text
severe overheating
critical electrical condition
```

Important:

```text
new pending DTC
repeated anomaly
```

Informational:

```text
scan completed
trip complete
```

Maintenance:

```text
oil due soon
brake fluid due
```

---

# 142. Notification Anti-Spam

Do not encourage:

```text
speed
hard acceleration
dangerous performance behavior
```

---

# 146. Design System

Keep a centralized design system.

Components:

```text
MetricCard
HealthCard
StatusBadge
WarningBanner
ChartCard
VehicleHeader
DiagnosticCard
ServiceActionCard
CapabilityBadge
```

Views should not invent unrelated visual styles.

---

# 147. Status Semantics

Use consistent status terminology:

```text
Good
Watch
Attention
Critical
Unknown
Unavailable
Learning
```

Do not use five different words for the same health level.

---

# 148. Empty States

Examples:

```text
No adapter connected

Connect an OBD adapter to see live vehicle information.
```

```text
Learning your vehicle

BMWCenter needs more driving data before it can detect meaningful changes.
```

Avoid fake placeholder data outside Simulator mode.

---

# 149. Simulator Mode

Simulator should be treated as an official development/testing feature.

Support scenarios:

```text
healthy vehicle
cold start
overheating
fuel trim drift
turbo underboost
battery weakness
DTC event
trip
BLE disconnect
slow adapter
```

---

# 150. Replay Transport

Add a ReplayTransport.

Input:

```text
recorded request/response trace
```

Allows deterministic reproduction of real vehicle sessions.

This is extremely valuable for protocol debugging.

---

# 151. Diagnostic Fixture Format

Example:

```json
{
  "name": "BMW_F30_Healthy",
  "adapter": {},
  "vehicle": {},
  "frames": [
    {
      "request": "010C",
      "response": "410C1AF8"
    }
  ]
}
```

Keep fixtures anonymized.

---

# 152. Testing Pyramid

## Unit tests

Test:

```text
PID parsing
DTC parsing
ISO-TP reconstruction
VIN decoding
fuel calculation
baseline
anomaly detection
trip state
capability resolver
service validation
```

## Integration tests

Test:

```text
adapter initialization
command scheduling
session lifecycle
mock vehicle scan
```

## Hardware tests

Test with real vehicles/adapters.

---

# 153. Parser Fuzz Testing

OBD input is external/untrusted data.

Test malformed:

```text
odd hex
unexpected spaces
partial frame
invalid length
duplicate frame
missing prompt
wrong ECU header
timeout
```

Parser must fail safely.

---

# 154. Hardware-in-the-Loop Testing

Before enabling ECU-writing functions publicly, maintain a test matrix.

Example:

```text
Vehicle
Year
Engine
ECU software
Adapter
Transport
Feature
Result
```

No coding feature should move from Experimental to Supported without real validation.

---

# 155. Real-World Adapter Matrix

Minimum validation should eventually include:

```text
high-quality BLE ELM/STN adapter
common budget ELM327
BMW-focused adapter
Ethernet/ENET setup
```

Exact commercial models can be documented separately.

---

# 156. Connection Metrics

Track locally and optionally through privacy-preserving analytics:

```text
connection success rate
initialization duration
timeout rate
disconnect count
average command latency
scan completion rate
```

These are more useful than generic screen-view analytics during early development.

---

# 157. Product Metrics

Important MVP metrics:

```text
successful adapter connection %
successful vehicle identification %
successful health scan %
automatic trip start accuracy
automatic trip stop accuracy
crash-free sessions
average diagnostic scan duration
report export rate
repeat usage
```

---

# 158. Performance Requirements

The application should remain responsive while polling OBD.

Never decode telemetry on the main actor unnecessarily.

Use:

```text
actors
async/await
structured concurrency
```

for communication and parsing.

UI state updates should be aggregated.

---

# 159. Memory Requirements

Do not keep entire high-frequency telemetry history in memory.

Use:

```text
rolling buffers
downsampling
incremental statistics
persistent chunks
```

Charts should request only visible data windows.

---

# 160. Battery Usage

When screen is not displaying live data:

reduce polling.

When recording a trip:

collect only required telemetry.

When disconnected:

avoid aggressive BLE scanning loops.

---

# 161. Background Behavior

iOS background execution is restricted.

Do not design the product around unlimited background BLE execution.

Trip functionality must account for iOS lifecycle limitations.

Use supported background modes only where justified and compliant.

---

# 162. Logging

Logging categories:

```text
Transport
Adapter
Protocol
Diagnostics
OEM
Telemetry
Trip
Health
Storage
CarPlay
Service
Coding
```

Production logs must redact sensitive identifiers where appropriate.

---

# 163. Error Model

Avoid raw errors such as:

```text
Error -5
```

Create structured domain errors:

```text
adapterNotFound
adapterUnsupported
vehicleNotResponding
protocolNegotiationFailed
ecuUnavailable
requestTimeout
securityAccessRequired
featureUnsupported
featureBlockedByAdapter
servicePreconditionFailed
```

UI should translate errors into actionable messages.

---

# 164. Error Example

Bad:

```text
NO DATA
```

Better:

```text
The vehicle did not return data for this sensor.

Possible reasons:
- the vehicle does not support this PID
- the engine is off
- the current ECU does not expose it
```

---

# 165. DTC Catalog

Continue using generated catalog resources.

Catalog entries should distinguish:

```text
generic SAE
manufacturer-specific
BMW-specific
```

Preserve Turkish localization.

Add source/license metadata to generated catalogs.

---

# 166. DTC Catalog Build Pipeline

Script should validate:

```text
duplicate code
invalid code
missing description
bad localization
source license
BMW-specific overrides
```

Generate deterministic output.

---

# 167. Localization

Architecture should support:

```text
Turkish
English
```

from the start.

Diagnostic technical terminology must remain consistent.

Never hard-code user-visible text inside protocol definitions.

---

# 168. Accessibility

Support:

```text
Dynamic Type
VoiceOver
high contrast
reduced motion
```

Critical states must not rely only on color.

---

# 169. MVP CarPlay Requirement

CarPlay should NOT block initial App Store launch if entitlement approval is unavailable.

Architecture should make CarPlay optional.

Main app must compile and run independently.

---

# 170. Apple Developer Requirements

Personal Team limitations are not appropriate for a production commercial release.

Before App Store distribution:

```text
Apple Developer Program enrollment
production signing
App Store provisioning
widget entitlements
CarPlay entitlement/application as required
```

must be resolved.

---

# 171. MVP Release Scope

## Release 1.0

Include:

```text
BLE ELM connection
adapter detection
generic OBD
vehicle identification
capability engine
live dashboard
DTC
freeze frame
pending/permanent codes
Mode 6
readiness
trip recording
fuel
maintenance
vehicle health
baseline learning
mechanic report
exports
minimal CarPlay if entitlement available
```

---

# 172. Release 1.1

BMW Enhanced Read.

Include:

```text
BMW vehicle identification improvements
BMW ECU inventory
DME diagnostics
EGS diagnostics
DSC diagnostics
enhanced live data
BMW DTC
BMW battery data
BMW service-status reading
```

Still primarily read-only.

---

# 173. Release 1.2

BMW Service.

Potential:

```text
battery registration
service reset
EPB
DPF functions
fuel pump priming
supported actuator/service functions
```

Every operation must have safety verification.

---

# 174. Release 1.3

BMW Customization.

Potential:

```text
supported coding
ASD
lighting
comfort
CarPlay configuration
SPORT-related supported values
```

Backups mandatory.

---

# 175. Release 1.4

BMW EV/PHEV.

Include:

```text
battery health
cell data
battery temperatures
energy
charging analytics
```

---

# 176. Release 1.5

Used Car Check.

Include:

```text
scan bundle
module consistency
mileage-source comparison
health summary
printable report
```

---

# 177. Release 1.6

Performance.

Include:

```text
acceleration timing
performance telemetry
run comparison
performance graphs
```

---

# 178. Release 2.x

Multi-brand OEM providers.

Suggested order:

```text
1. VAG
2. Toyota/Lexus
3. Ford/Lincoln
4. Hyundai/Kia/Genesis
5. Mercedes
6. Stellantis
7. GM
8. Nissan/Infiniti
9. Mazda
```

Order may change based on available protocol information and hardware testing.

---

# 179. Multi-Brand Product Architecture

Even while the UI says BMWCenter:

Core code should use:

```text
VehicleBrand
OEMProvider
VehicleCapability
DiagnosticProtocol
ServiceAction
CodingFeature
```

Do not create universal concepts named:

```text
BMWVehicle
BMWTrip
BMWDiagnosticSession
```

unless they are genuinely BMW-specific.

---

# 180. Potential Future Rebranding

If multi-brand support becomes significant, product branding may later change.

Possible structure:

```text
Core product
    ├── BMW Pack
    ├── VAG Pack
    ├── Toyota Pack
    └── Ford Pack
```

This is a business decision and should not affect current architecture.

---

# 181. Monetization

Potential product tiers:

## Free

```text
connection
basic live dashboard
generic DTC
basic scan
limited trip history
```

## Pro

```text
advanced live data
graphs
unlimited trips
vehicle health
baseline analysis
exports
mechanic report
maintenance analytics
```

## BMW Enhanced Pack

```text
BMW ECU diagnostics
BMW advanced sensors
```

## BMW Service Pack

```text
battery registration
service reset
supported service procedures
```

## BMW Coding Pack

```text
supported one-click coding
```

## EV Health Pack

```text
EV/PHEV battery diagnostics
```

## Used Car Check

Could be:

```text
one-time purchase
scan credit
premium entitlement
```

---

# 182. Monetization Principle

Avoid making basic safety diagnostics inaccessible.

Users should be able to:

```text
connect
see critical warnings
read basic generic DTC
```

without complex credit systems.

Prefer understandable purchases over confusing token systems.

---

# 183. Research-Based Competitive Position

BMWCenter should NOT compete purely as:

```text
cheap BimmerLink
```

or:

```text
another generic ELM dashboard
```

Competitive differentiation:

```text
OEM diagnostics
        +
personal vehicle baseline
        +
historical trend analysis
        +
pre-DTC anomaly detection
        +
maintenance
        +
used-car inspection
```

---

# 184. Competitor Lessons

## BimmerLink

Lesson:

BMW owners value deep ECU access, service functions and BMW-specific sensors.

## BimmerCode

Lesson:

Simple one-click configuration can be more valuable to users than raw ECU data.

## OBDeleven

Lesson:

Service actions and manufacturer-specific functionality drive recurring product value.

## Carly

Lesson:

Vehicle ownership, used-car checking and maintenance create value beyond enthusiast diagnostics.

## BlueDriver

Lesson:

Users want an explanation of a DTC, not only a code.

## OBD Fusion

Lesson:

Custom dashboards, logging and OEM expansion packs work well together.

## FORScan

Lesson:

Deep manufacturer-specific diagnostics can build a strong enthusiast/professional community.

## Carista

Lesson:

Service and customization functions attract ordinary vehicle owners, not only mechanics.

## EVScanner

Lesson:

Battery health can become an entire premium product category.

---

# 185. Features NOT to Implement Yet

Do not allow scope creep.

Postpone:

```text
social network
public user profiles
vehicle marketplace
mechanic marketplace
insurance integration
cloud fleet management
remote vehicle control
ConnectedDrive replacement
Android app
web dashboard
desktop app
AI coding
automatic repair ordering
```

unless explicitly prioritized later.

---

# 186. Safety Rule: Read vs Write

Every diagnostic function MUST declare:

```text
ReadOnly
ServiceWrite
CodingWrite
SecuritySensitive
```

UI should never accidentally expose a write function as a normal sensor operation.

---

# 187. Safety Rule: Vehicle Motion

Certain operations must require stationary vehicle state.

Examples:

```text
coding
service reset
battery registration
EPB
DPF service
configuration
```

If speed cannot be reliably verified, the application should refuse high-risk operations unless the specific action explicitly supports that state.

---

# 188. Safety Rule: Voltage

ECU coding and service operations can fail when voltage is unstable.

Where relevant:

```text
read voltage
warn when voltage low
stop before write when unsafe
```

Do not use one universal voltage threshold for all vehicles without validation.

---

# 189. Safety Rule: Security Access

UDS services may require security access.

BMWCenter must not implement unauthorized security bypasses.

Valid states:

```text
authorized
security required
security unavailable
blocked
```

---

# 190. UDS Architecture

Future OEM diagnostics will likely require ISO 14229 concepts.

Design for services such as:

```text
0x10 Diagnostic Session Control
0x11 ECU Reset
0x19 Read DTC Information
0x22 Read Data By Identifier
0x2E Write Data By Identifier
0x27 Security Access
0x2F Input Output Control
0x31 Routine Control
0x3E Tester Present
```

MVP OEM implementations should prioritize read operations.

Write operations require separate safety review.

---

# 191. ISO-TP

Implement ISO-TP independently from application-level UDS where transport requires it.

Responsibilities:

```text
single frame
first frame
consecutive frame
flow control
sequence validation
timeout
payload reconstruction
```

Test heavily.

---

# 192. DoIP

Future Ethernet-based vehicles may use Diagnostics over IP.

Create an independent:

```text
DoIPTransport
```

or protocol layer where appropriate.

Responsibilities may include:

```text
vehicle discovery
routing activation
diagnostic messages
alive checks
session lifecycle
```

Do not assume every Ethernet diagnostic implementation behaves identically.

---

# 193. BMW ENET

BMW ENET support should be isolated behind:

```text
BMWENETTransport
```

or an equivalent BMW transport/session provider.

Do not force BMW Ethernet diagnostics through ELM abstractions.

BMW ENET and standards-based DoIP can share lower-level concepts where appropriate but should not be assumed identical across every BMW generation.

---

# 194. Connection Selection

Future connection screen:

```text
Bluetooth OBD
BMW ENET
Ethernet / DoIP
Simulator
Replay
```

Only show connection types built into the current release.

---

# 195. Automatic Adapter Recognition

Connection flow:

```text
scan
↓
identify candidate
↓
connect
↓
query firmware
↓
probe capabilities
↓
cache adapter profile
```

Known adapter profiles can optimize initialization but should not replace runtime validation.

---

# 196. Vehicle Garage

Garage supports multiple vehicles.

Each vehicle:

```text
photo
nickname
VIN
make
model
year
engine
odometer
adapter preference
last health
last scan
last trip
maintenance
```

---

# 197. Vehicle Switching

Do not silently assign data to the wrong vehicle.

On connection:

```text
read VIN
↓
match Garage
↓
select profile
```

If VIN is unavailable:

ask the user before permanently associating trip data.

---

# 198. Odometer

Generic OBD does not reliably provide odometer across all cars.

Use:

```text
OEM value when available
user-entered odometer
trip-based estimate
```

Keep provenance.

Never imply estimated odometer was ECU-read.

---

# 199. Health History

Create timeline:

```text
Jan
92

Feb
91

Mar
89

Apr
87
```

User can inspect why.

Example:

```text
- Battery score declined
- Fuel trim drift increased
```

---

# 200. Correlation Engine

Post-MVP:

Detect related anomalies.

Example:

```text
high fuel trim
+
low measured airflow
+
normal lambda response
```

may produce a stronger diagnostic observation.

Do not let correlation engine automatically declare a repair.

---

# 201. Sensor Plausibility

Before analytics, validate:

```text
physical range
rate of change
staleness
cross-sensor relationships
```

Example:

If:

```text
RPM = 0
Speed = 120 km/h
```

this may be valid while coasting on some systems but should not automatically be treated as impossible without context.

Use conservative plausibility rules.

---

# 202. Time Synchronization

Use monotonic time for sample ordering.

Wall-clock time can change due to:

```text
timezone
manual clock changes
network sync
```

Trip elapsed time should not rely purely on wall clock.

---

# 203. Units

Internal data should use canonical units.

Presentation can support:

```text
metric
imperial
```

Example internal:

```text
temperature Celsius
pressure kPa
distance meters
speed m/s
```

or a clearly documented equivalent.

Conversion belongs in formatting layer.

---

# 204. Pressure Handling

Boost is often confused between:

```text
absolute pressure
gauge pressure
```

Store the semantic type.

Example:

```text
MAP absolute: 180 kPa
Barometric: 100 kPa
Boost gauge: 80 kPa
```

Never label MAP directly as boost without compensation.

---

# 205. Location

GPS recording should be optional.

When disabled:

trip logging still works using vehicle speed/distance where possible.

Maps should gracefully disappear rather than breaking trip recording.

---

# 206. Insights

Insights should be generated from real data.

Examples:

```text
Fuel economy improved 8% this month.
Warm-up time increased.
Battery startup voltage decreased.
Most trips are shorter than full engine warm-up.
```

Avoid generic motivational filler.

---

# 207. Monthly Vehicle Report

Post-MVP:

```text
Distance
Fuel
Cost
Average consumption
Health change
DTC events
Maintenance
Battery trend
Driving patterns
```

Could be generated entirely on device.

---

# 208. Home Screen Priority Logic

Home screen should prioritize:

```text
critical warning
active fault
pending fault
maintenance due
health trend
normal summary
```

Never allow low-value cards to push urgent vehicle status below the fold.

---

# 209. Deep Links

Add App Intents/deep links for:

```text
Scan Vehicle
Open Live Dashboard
Start Trip
Open Vehicle Health
Add Fuel
Add Maintenance
```

Write operations such as ECU coding should not be directly triggerable by Siri automation.

---

# 210. App Intents Safety

Allow read-only shortcuts.

Examples:

```text
What is my last vehicle health?
Start trip
Open dashboard
```

Do not permit:

```text
Clear DTC
Code ECU
Reset service
Start DPF regeneration
```

through unattended shortcuts.

---

# 211. Search

Post-MVP, global search can search:

```text
DTC
maintenance
trips
vehicles
sensors
```

Example:

```text
P0299
```

returns current and historical occurrences.

---

# 212. Support Diagnostics

Add:

```text
Export Support Bundle
```

Bundle:

```text
app version
iOS version
adapter profile
protocol state
redacted logs
error traces
```

VIN redacted by default.

---

# 213. Developer Mode

Hidden/advanced Developer Mode:

```text
raw request/response
ECU headers
PID discovery
transport metrics
session state
```

This is valuable for developing future OEM support.

Do not expose write commands by default.

---

# 214. Raw Console

If a raw command console is eventually implemented:

```text
Read-only safe commands by default
```

Arbitrary diagnostic writes require explicit expert mode and should not be part of MVP.

---

# 215. Database Migration

All SwiftData schema changes require migration strategy.

Never delete user trip/maintenance data because of model changes.

Tests should include migration from previous schema versions.

---

# 216. Crash Recovery

If the app terminates during an active trip:

on next launch:

```text
inspect unfinished trip
recover if possible
mark interrupted
```

Do not silently discard it.

---

# 217. Service/Coding Crash Recovery

If the application terminates during an ECU write:

store enough transaction state before execution to identify:

```text
action
ECU
step
backup
```

On relaunch:

do NOT automatically continue.

Explain that the operation was interrupted and provide recovery guidance.

---

# 218. Background Database Writes

Batch telemetry writes.

Avoid SwiftData write transaction for every individual PID update.

---

# 219. UI Update Rate

Telemetry acquisition rate and UI rate should be independent.

Example:

```text
Acquire 10 Hz
Render UI 5 Hz
Persist aggregate 2 Hz
```

depending on data type.

This reduces energy and rendering overhead.

---

# 220. Sampling Budget

Create a telemetry budget.

Example conceptual budget:

```text
Performance sensors     50%
Safety sensors          20%
Trip sensors            15%
Health learning         10%
Optional sensors         5%
```

Actual implementation should use request latency rather than fixed percentages if more practical.

---

# 221. Connection Benchmark

At start of session estimate adapter throughput.

Then select:

```text
Low
Medium
High
```

telemetry profile.

Do not promise unrealistic sample rates on slow ELM327 adapters.

---

# 222. Health Confidence

Each health result:

```text
value
state
confidence
evidence
```

Example:

```text
Turbo Health
Watch

Confidence
Medium

Evidence
87 valid high-load samples
```

---

# 223. Learning Mode UI

Before enough data exists:

```text
Learning

BMWCenter is building a normal operating profile for this vehicle.

Warm-engine samples
43 / 100
```

This sets correct user expectations.

---

# 224. Baseline Reset

Allow users to reset baseline after:

```text
major engine repair
engine replacement
major tune
sensor replacement
```

Do not delete trip history when baseline is reset.

---

# 225. Vehicle Modification Profile

Post-MVP allow:

```text
Stock
Stage 1
Stage 2
Custom
```

This is metadata only unless specific tuning integrations are added.

Baseline should know when a major configuration changed.

---

# 226. Baseline Epoch

Instead of destroying history:

```text
Baseline Epoch 1
Stock

Baseline Epoch 2
After repair

Baseline Epoch 3
Stage 1
```

This makes before/after comparison possible.

---

# 227. Repair Verification

Powerful future feature.

After mechanic work:

```text
Mark repair performed
```

BMWCenter starts a new observation period.

Compare:

```text
before repair
after repair
```

Example:

```text
Fuel trim at idle

Before
+12%

After
+3%

Improvement detected
```

---

# 228. Maintenance Intelligence

When a maintenance item is completed, correlate it with health changes.

Examples:

```text
spark plug replacement
→ misfire rate

air filter
→ MAF/load behavior

battery replacement
→ startup voltage
```

Do not automatically claim causality.

---

# 229. Workshop Mode

Future mode for mechanics.

Capabilities:

```text
rapid vehicle switching
scan
service actions
report generation
customer notes
```

Do not include multi-customer cloud management in initial consumer roadmap.

---

# 230. Fleet Mode

Very late roadmap.

Potential:

```text
business fleets
health dashboards
maintenance scheduling
cross-vehicle analytics
```

Requires backend and privacy architecture.

Not part of current implementation.

---

# 231. Backend Requirement

The MVP should not require a backend.

Future backend may provide:

```text
cloud backup
account
device sync
vehicle population statistics
PID pack updates
AI analysis
community reports
```

Design local models so backend can be added later without making cloud mandatory.

---

# 232. Population Baselines

Future backend feature.

Example:

```text
BMW B48
50,000–75,000 km

Average battery SOH
...

Average warm-up duration
...
```

Users could compare:

```text
Your vehicle
vs
similar vehicles
```

This requires sufficient anonymized data and explicit user consent.

---

# 233. Community Data

Do not allow unreviewed community definitions to issue ECU write commands.

Community content may initially include:

```text
read-only PID definitions
dashboard presets
descriptions
```

Officially reviewed packs must be cryptographically/version controlled if remote distribution is added.

---

# 234. Remote Pack Security

Future downloadable OEM definitions should be signed.

Verify:

```text
publisher
signature
version
hash
compatibility
```

before use.

Do not dynamically execute arbitrary code downloaded from the Internet.

---

# 235. Product Naming Inside Code

Use brand-neutral core naming.

Good:

```text
VehicleSession
OEMProvider
DiagnosticService
VehicleHealthEngine
```

Avoid:

```text
BMWEverythingManager
BMWGlobalOBDService
```

BMW-specific classes belong under:

```text
OEM/BMW/
```

---

# 236. Recommended BMW Module Structure

```text
Core/OEM/BMW/
├── BMWProvider.swift
├── BMWVehicleIdentifier.swift
├── BMWECUDiscovery.swift
├── BMWCapabilities.swift
├── Protocol/
│   ├── BMWDiagnosticSession.swift
│   ├── BMWAddressing.swift
│   └── BMWResponseParser.swift
├── ECU/
│   ├── DME/
│   ├── EGS/
│   ├── DSC/
│   ├── IBS/
│   ├── FEM/
│   └── BDC/
├── LiveData/
├── Diagnostics/
├── Service/
├── Coding/
└── EV/
```

---

# 237. Generic Diagnostics Structure

```text
Core/Diagnostics/GenericOBD/
├── OBDMode.swift
├── PIDDefinition.swift
├── PIDRegistry.swift
├── PIDDecoder.swift
├── SupportedPIDDiscovery.swift
├── GenericDTCService.swift
├── FreezeFrameService.swift
├── Mode6Service.swift
├── ReadinessService.swift
└── VehicleInfoService.swift
```

---

# 238. Health Structure

```text
Core/VehicleHealth/
├── HealthEngine.swift
├── HealthCategory.swift
├── HealthSnapshot.swift
├── Evidence.swift
├── Baseline/
│   ├── BaselineLearner.swift
│   ├── BaselineCell.swift
│   ├── OperatingRegion.swift
│   └── Statistics.swift
├── Anomaly/
│   ├── AnomalyDetector.swift
│   ├── DriftDetector.swift
│   └── Confidence.swift
└── Events/
    ├── EventDetector.swift
    ├── EventRule.swift
    └── EventRegistry.swift
```

Existing implementation should be migrated gradually rather than deleted.

---

# 239. Definition of Done for Every New Feature

A feature is not done until:

```text
implementation exists
UI works
error state works
unsupported state works
unit tests exist
mock/simulator scenario exists
documentation updated
capability system updated
analytics/logging considered
privacy implications reviewed
```

OEM write features additionally require:

```text
preconditions
backup if applicable
verification
hardware validation
audit record
```

---

# 240. Phase 0 — Repository and Architecture Audit

Tasks:

* Initialize Git.
* Commit current state untouched.
* Run all tests.
* Verify simulator.
* Verify physical device build.
* Document current architecture.
* Document current SwiftData models.
* Document BLE flow.
* Document existing CarPlay flow.
* Inspect Watch source.
* Inspect Widget signing.
* Identify duplicate logic.
* Identify dead code.
* Do not refactor yet.

Deliver:

```text
docs/architecture-current.md
docs/data-model-current.md
docs/obd-current.md
docs/test-matrix-current.md
```

---

# 241. Phase 1 — Transport Foundation

Implement:

```text
VehicleTransport
Adapter abstraction
DiagnosticSession
serialized command scheduler
connection state machine
reconnect
transport metrics
ELM parser hardening
Mock transport
Replay transport
```

Acceptance:

```text
No UI directly sends ELM commands.
Only one active command per ELM session.
Timeout behavior deterministic.
BLE interruption recoverable.
All parser tests pass.
```

---

# 242. Phase 2 — Generic OBD Foundation

Implement/refactor:

```text
PID registry
supported PID discovery
VIN
Mode 01
Mode 02
Mode 03
Mode 04
Mode 06
Mode 07
Mode 09
Mode 0A
readiness
```

Acceptance:

```text
Unsupported PIDs never crash.
Malformed frames never crash.
DTC scan correctly groups status.
Mode 04 requires confirmation.
Readiness reset warning exists.
```

---

# 243. Phase 3 — Capability Engine

Implement:

```text
AdapterCapabilities
VehicleCapabilities
CapabilityResolver
CapabilityReason
Capability UI
```

Acceptance:

The UI can distinguish:

```text
vehicle unsupported
adapter unsupported
security blocked
feature experimental
feature supported
```

---

# 244. Phase 4 — Home and Health Scan

Implement:

```text
Vehicle Health home card
Scan Vehicle
scan history
scan comparison
health summary
```

Acceptance:

One tap produces a structured report without requiring the user to understand PIDs.

---

# 245. Phase 5 — Telemetry Scheduler

Implement:

```text
sensor registry
sampling classes
request prioritization
adapter throughput measurement
adaptive polling
quality tracking
```

Acceptance:

Slow adapters degrade gracefully.

UI remains responsive.

No uncontrolled request flood.

---

# 246. Phase 6 — Trip System Hardening

Verify/refactor:

```text
trip state machine
disconnect tolerance
crash recovery
automatic start
automatic stop
GPS optionality
trip summaries
```

Acceptance:

Trip start/stop accuracy must be validated on real drives.

---

# 247. Phase 7 — Vehicle Health Engine

Implement/refine:

```text
operating regions
baseline cells
Welford statistics
confidence
anomaly persistence
hysteresis
event explanations
```

Initial supported health insights:

```text
battery voltage trend
warm-up drift
fuel-trim drift
coolant abnormalities
generic sensor anomalies
```

---

# 248. Phase 8 — Maintenance

Implement:

```text
maintenance schedule
maintenance history
cost
attachments
next service
```

Do not block maintenance behind OBD connection.

---

# 249. Phase 9 — Reports

Implement:

```text
mechanic PDF
CSV
GPX
diagnostic export
VIN redaction
```

Acceptance:

A mechanic can understand the exported report without using BMWCenter.

---

# 250. Phase 10 — CarPlay Simplification

Refactor CarPlay away from phone-tab mirroring.

Keep:

```text
status
trip
few driving metrics
personal/business classification
```

Remove or avoid:

```text
diagnostic management
complex history
fuel editing
service
coding
```

---

# 251. Phase 11 — BMW Enhanced Read

Implement BMW provider.

Start with a tightly scoped validated test platform.

Do NOT claim broad BMW compatibility immediately.

Goals:

```text
vehicle identity
ECU inventory
DME read
EGS read
DSC read
BMW DTC
advanced sensors
```

---

# 252. Phase 12 — BMW Health Models

Add BMW-specific observations:

```text
boost target/actual
misfire counters
fuel pressure
IBS
cooling
transmission
```

Integrate into generic health engine through normalized sensor definitions.

Do not create a completely separate BMW health system.

---

# 253. Phase 13 — BMW Service

Only after read-only BMW diagnostics are stable.

Implement safe service actions individually.

Suggested priority:

```text
1 battery registration
2 CBS/service reset
3 EPB service
4 DPF functions
5 fuel pump priming
```

Each action ships independently after hardware validation.

---

# 254. Phase 14 — BMW Coding

Build:

```text
backup engine
parameter registry
compatibility resolver
safe write pipeline
verification
history
rollback
```

Start with low-risk highly validated features.

---

# 255. Phase 15 — BMW EV

Add electrified vehicle module.

Focus:

```text
SOH
cell data
temperature
energy
charging
```

---

# 256. Phase 16 — Used Car Check

Combine:

```text
scan
health
mileage sources
battery
emissions
history
report
```

---

# 257. Phase 17 — Multi-Brand

Implement brands one at a time using OEM provider architecture.

Never duplicate whole application architecture for a new brand.

---

# 258. Required Documentation During Development

Maintain:

```text
ARCHITECTURE.md
ROADMAP.md
SAFETY.md
PRIVACY.md
SUPPORTED_VEHICLES.md
SUPPORTED_ADAPTERS.md
OEM_BMW.md
OEM_VAG.md
OEM_FORD.md
OEM_TOYOTA.md
DATA_DICTIONARY.md
TEST_MATRIX.md
RELEASE.md
```

---

# 259. Supported Vehicles Documentation

Do not use vague marketing wording.

Example:

```text
BMW F30

Generic OBD
Validated

DME Enhanced
Validated on selected engine/software combinations

EGS
Experimental

Battery Registration
Not yet released
```

---

# 260. Test Matrix Format

```text
Manufacturer
Model
Generation
Year
Engine
Transmission
VIN prefix if useful
ECU
ECU software
Adapter
Transport
App version
Feature
Result
Notes
```

---

# 261. Experimental Feature Flag

OEM functionality should support:

```text
Development
Experimental
Validated
Production
Disabled
```

Experimental features require explicit opt-in.

---

# 262. Feature Flags

Examples:

```text
enableBMWEnhancedDiagnostics
enableBMWBatteryRegistration
enableBMWCoding
enableUsedCarCheck
enableEVHealth
```

Feature flags should not be spread throughout views.

Use centralized configuration.

---

# 263. Remote Feature Flags

Do not introduce remote kill switches during MVP unless backend exists.

Local build-time/config flags are sufficient.

Remote controls may later be useful for disabling a dangerous OEM function.

---

# 264. Release Safety

If field reports show that a service/coding feature can produce unsafe states:

The architecture should allow the feature to be disabled rapidly in a future backend-enabled version.

---

# 265. App Store Positioning

Do not market BMWCenter as a replacement for professional diagnostic equipment.

Possible language:

> Vehicle diagnostics and health monitoring companion.

Not:

> Guaranteed professional fault diagnosis.

---

# 266. Disclaimers

High-risk actions should clearly state that vehicle behavior and support depend on:

```text
vehicle
ECU software
adapter
battery condition
market
configuration
```

Avoid unnecessary legal text throughout the UI; put warnings where relevant.

---

# 267. Primary Product Differentiators

The product should eventually have five pillars.

## Pillar 1

### Diagnose

```text
DTC
freeze frame
Mode 6
OEM scan
```

## Pillar 2

### Understand

```text
plain-language explanation
health
evidence
```

## Pillar 3

### Monitor

```text
live data
trips
baseline
trends
```

## Pillar 4

### Maintain

```text
maintenance
service
reports
```

## Pillar 5

### Personalize

```text
OEM configuration
coding
```

---

# 268. Primary Differentiator: Personal Vehicle Intelligence

The most strategically important functionality is:

```text
Vehicle
↓
Telemetry
↓
Operating context
↓
Personal baseline
↓
Historical changes
↓
Health events
↓
Actionable explanation
```

Most OBD products tell the user what the car reports now.

BMWCenter should additionally answer:

> Is this normal for my particular car?

and:

> Has this behavior changed over time?

---

# 269. Final MVP Navigation

Recommended:

```text
HOME
Vehicle summary
Health
Scan
Next maintenance

LIVE
Dashboard
Graphs

HEALTH
Categories
Events
DTC
Scan history

TRIPS
History
Map
Fuel
Insights

GARAGE
Vehicles
Maintenance
Adapters
Reports
Settings
```

---

# 270. MVP Home Example

```text
─────────────────────────────
BMW 316i
Connected
─────────────────────────────

VEHICLE HEALTH

87
GOOD

Engine       Good
Cooling      Good
Battery      Watch
Emissions    Good

Battery startup voltage has
declined during recent starts.

[ View Health ]

─────────────────────────────

LIVE

Coolant          96°C
Battery          14.4 V
RPM              780
Consumption      0.8 L/h

[ Live Dashboard ]

─────────────────────────────

DIAGNOSTICS

No active engine faults
1 pending fault

[ Scan Vehicle ]

─────────────────────────────

LAST TRIP

32.4 km
42 min
7.1 L/100 km

─────────────────────────────
```

---

# 271. MVP Health Example

```text
VEHICLE HEALTH

Overall
87 / 100
Good

ENGINE
Good

COOLING
Good

BATTERY
Watch

Startup voltage
10.6 V

Historical typical range
11.0–11.4 V

Trend
Declining

Confidence
High

Why this matters

Startup voltage has been lower than
your normal range during three recent starts.
```

---

# 272. MVP Scan Example

```text
VEHICLE SCAN

Engine ECU
No stored faults

Pending
P0171

Permanent
None

Readiness
7 / 8 Ready

Mode 6
Catalyst monitor near threshold

Battery
Watch

New since last scan
P0171
```

---

# 273. MVP DTC Example

```text
P0171

SYSTEM TOO LEAN
BANK 1

Status
Pending

Severity
Medium

First seen
August 7

Occurrences
2

Recorded conditions

RPM
760

Coolant
94°C

STFT
+15%

LTFT
+10%

BMWCenter observation

Fuel correction is currently higher than
the learned idle baseline.

Possible systems to inspect

Air intake
Vacuum system
MAF
Fuel delivery
```

---

# 274. MVP Mechanic Report Example

```text
BMWCENTER VEHICLE REPORT

Vehicle
BMW 316i
F30

Scan
2026-08-07 21:42

DTC
P0171 Pending

Health observations
Fuel correction drift detected at idle.

Battery
Startup minimum: 10.6 V

Recent event
Fuel trim remained above historical
baseline during four warm-idle periods.

Attached
Freeze frame
Sensor graph
Trip summary
```

---

# 275. Grok Implementation Rules

When this document is supplied to Grok 4.5 as a coding task, Grok MUST follow this workflow:

```text
1. Inspect repository.
2. Read project.yml.
3. Run existing tests.
4. Inspect current OBD architecture.
5. Inspect SwiftData entities.
6. Inspect existing Care/Baseline/EventDetector code.
7. Produce a short implementation gap analysis.
8. Implement one roadmap phase at a time.
9. Run tests after each phase.
10. Fix regressions before continuing.
11. Add tests for every new protocol/parser/domain component.
12. Keep project compiling.
13. Avoid deleting working functionality.
14. Avoid speculative OEM functionality.
15. Mark unverified OEM functionality Experimental.
```

---

# 276. Grok Must Never

Grok MUST NOT:

```text
rewrite the entire project unnecessarily
remove existing features without cause
hard-code one vehicle everywhere
hard-code one adapter everywhere
assume all BMW vehicles use the same ECU
assume all ELM327 adapters are equivalent
perform arbitrary ECU writes
bypass security gateways
invent unsupported PID formulas
invent unsupported ECU addresses
claim hardware tests were performed when they were not
replace real unsupported states with mock success
store secrets in source
make cloud access mandatory
put destructive operations into CarPlay
```

---

# 277. Grok Should Prefer

```text
small testable services
protocols
actors for communication state
immutable value models
dependency injection
mock transports
fixture-driven protocol tests
capability-driven UI
versioned data definitions
explicit safety states
```

---

# 278. Immediate Development Backlog

Execute in this order.

## P0

* Initialize Git.
* Run baseline tests.
* Document architecture.
* Stabilize transport abstraction.
* Create command scheduler.
* Harden ELM parsing.
* Create DiagnosticSession.
* Implement adapter capability model.
* Implement vehicle capability model.
* Implement CapabilityResolver.
* Refactor generic OBD into registry/services.

## P1

* Health Scan.
* Scan history.
* Scan comparison.
* Mode 6.
* Readiness.
* Improved DTC presentation.
* Vehicle Health.
* Telemetry quality model.
* Adaptive polling.
* Trip recovery.
* Mechanic report.

## P2

* Maintenance improvements.
* Ownership cost.
* Replay transport.
* Support bundle.
* BMW OEM provider.
* BMW ECU discovery.
* BMW DME read.
* BMW EGS read.
* BMW DSC read.
* BMW-specific DTC.
* BMW sensor registry.

## P3

* BMW battery/IBS.
* BMW service status.
* Battery registration.
* CBS reset.
* EPB.
* DPF.
* BMW EV health.

## P4

* BMW coding engine.
* Coding backup.
* Coding rollback.
* One-click configuration.

## P5

* Used Car Check.
* Performance mode.
* Custom PID.
* PID packs.

## P6

* VAG.
* Toyota.
* Ford.
* Hyundai/Kia.
* Mercedes.
* Remaining OEM providers.

---

# 279. MVP Release Checklist

Before version 1.0:

### Engineering

* [ ] Git repository active
* [ ] clean build
* [ ] unit tests pass
* [ ] UI tests reviewed
* [ ] crash recovery tested
* [ ] migration tested

### OBD

* [ ] adapter connect
* [ ] reconnect
* [ ] timeout recovery
* [ ] supported PID discovery
* [ ] VIN
* [ ] Mode 01
* [ ] Mode 02
* [ ] Mode 03
* [ ] Mode 04
* [ ] Mode 06
* [ ] Mode 07
* [ ] Mode 09
* [ ] Mode 0A

### Diagnostics

* [ ] stored DTC
* [ ] pending DTC
* [ ] permanent DTC
* [ ] freeze frame
* [ ] readiness
* [ ] Mode 6

### Vehicle

* [ ] Garage
* [ ] VIN association
* [ ] capability detection
* [ ] adapter compatibility

### Live

* [ ] dashboard
* [ ] graph
* [ ] presets
* [ ] stale-data handling

### Trip

* [ ] automatic start
* [ ] automatic stop
* [ ] disconnect recovery
* [ ] map
* [ ] fuel
* [ ] summary

### Health

* [ ] scan
* [ ] health categories
* [ ] baseline
* [ ] confidence
* [ ] anomaly hysteresis
* [ ] battery trend
* [ ] warm-up trend
* [ ] fuel trim trend

### Maintenance

* [ ] records
* [ ] reminders
* [ ] cost
* [ ] attachments

### Export

* [ ] CSV
* [ ] GPX
* [ ] PDF
* [ ] mechanic report

### Safety

* [ ] DTC clear confirmation
* [ ] no destructive CarPlay actions
* [ ] data provenance
* [ ] unsupported states

### Release

* [ ] Developer Program/signing
* [ ] privacy declarations
* [ ] App Store metadata
* [ ] CarPlay entitlement status
* [ ] Widget status
* [ ] production crash logging strategy

---

# 280. Final Product Direction

BMWCenter must not remain merely:

```text
Bluetooth
→
ELM327
→
PID
→
Gauge
```

The architecture should become:

```text
Vehicle
        │
        ▼
Transport
        │
        ▼
Adapter
        │
        ▼
Diagnostic Protocol
        │
        ▼
Generic + OEM Data
        │
        ▼
Normalized Telemetry
        │
        ├─────────────► Live Dashboard
        │
        ├─────────────► Trip
        │
        ├─────────────► Diagnostics
        │
        ├─────────────► Maintenance
        │
        └─────────────► Vehicle Health
                               │
                               ▼
                        Baseline Learning
                               │
                               ▼
                         Drift Detection
                               │
                               ▼
                          Health Events
                               │
                               ▼
                     Actionable Explanation
```

Long-term:

```text
BMWCenter

Generic OBD Platform
        +
BMW Enhanced Diagnostics
        +
BMW Service
        +
BMW Coding
        +
EV Battery Health
        +
Used Car Check
        +
Predictive Vehicle Health
        +
Multi-Brand OEM Packs
```

The central product promise should be:

> BMWCenter does not only read what your vehicle reports.
> It learns how your vehicle normally behaves, tracks how that behavior changes over time, identifies unusual patterns, explains diagnostic information in understandable terms, and provides safe manufacturer-specific tools where supported.

The MVP should establish this foundation before expanding into aggressive ECU coding or many vehicle brands.

The highest-priority technical architecture decisions are therefore:

1. Transport abstraction.
2. Serialized diagnostic command scheduler.
3. Robust ELM parser.
4. Diagnostic session model.
5. Adapter capability detection.
6. Vehicle capability detection.
7. Generic OBD service separation.
8. Normalized telemetry.
9. Vehicle Health engine.
10. Baseline/anomaly system.
11. BMW OEM provider architecture.
12. Safe service-action framework.
13. Coding framework only after read-only diagnostics are stable.
14. Multi-brand providers only after BMW architecture proves reusable.

The development philosophy should always remain:

```text
Correctness
>
Vehicle safety
>
Data quality
>
Explainability
>
Reliability
>
Feature count
```

A smaller number of reliable, properly validated diagnostic features is preferable to a large catalog of vehicle functions that may behave unpredictably across ECUs, model years or adapters.

This document is the master roadmap and architecture reference for continued BMWCenter development.
