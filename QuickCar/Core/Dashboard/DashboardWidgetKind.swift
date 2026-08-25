import Foundation

/// Catalog of dashboard widgets the user can place, hide, or resize.
/// Pinned chrome (connection, alerts/care chips, active trip) is **not** a kind.
enum DashboardWidgetKind: String, Codable, CaseIterable, Identifiable, Sendable {
    case speed
    case rpm
    case coolant
    case oilTemp
    case engineLoad
    case throttle
    case pedal
    case ignitionAdvance
    case catalyst
    case instantConsumption
    case fuelLevel
    case range
    case stft
    case ltft
    case maf
    case map
    case iat
    case fuelRail
    case lowPressureFuel
    case ecoScore
    case boost
    case boostSetpoint
    case intercooler
    case radiatorOutlet
    case ambient
    case transmissionOilTemp
    case voltage
    case batterySoc
    case alternatorVoltage
    case vanosIntake
    case vanosExhaust
    case oilPressure
    case vehicleScan
    case parking
    case dailyFuel

    var id: String { rawValue }

    /// IDs that must never appear in a persisted layout (pinned chrome).
    static let reservedPinnedChromeIDs: Set<String> = [
        "connection",
        "connectionPill",
        "alerts",
        "alertChipRow",
        "care",
        "careChips",
        "trip",
        "activeTrip",
        "tripStrip"
    ]

    var titleKey: String {
        switch self {
        case .speed: "metric.speed"
        case .rpm: "metric.rpm"
        case .coolant: "metric.coolant"
        case .oilTemp: "metric.oilTemp"
        case .engineLoad: "metric.engineLoad"
        case .throttle: "metric.throttle"
        case .pedal: "metric.pedal"
        case .ignitionAdvance: "metric.ignitionAdvance"
        case .catalyst: "metric.catalyst"
        case .instantConsumption: "metric.instant"
        case .fuelLevel: "metric.fuelLevel"
        case .range: "metric.range"
        case .stft: "metric.fuelTrimShort"
        case .ltft: "metric.fuelTrimLong"
        case .maf: "metric.maf"
        case .map: "metric.map"
        case .iat: "metric.intakeAir"
        case .fuelRail: "metric.fuelRail"
        case .lowPressureFuel: "metric.lowPressureFuel"
        case .ecoScore: "metric.ecoScore"
        case .boost: "metric.boost"
        case .boostSetpoint: "metric.boostSetpoint"
        case .intercooler: "metric.intercooler"
        case .radiatorOutlet: "metric.radiatorOutlet"
        case .ambient: "metric.ambient"
        case .transmissionOilTemp: "metric.transmissionOilTemp"
        case .voltage: "metric.voltage"
        case .batterySoc: "metric.batterySoc"
        case .alternatorVoltage: "metric.alternatorVoltage"
        case .vanosIntake: "metric.vanosIntake"
        case .vanosExhaust: "metric.vanosExhaust"
        case .oilPressure: "metric.oilPressure"
        case .vehicleScan: "scan.action"
        case .parking: "parking.findCar"
        case .dailyFuel: "dashboard.dailyFuel.title"
        }
    }

    var systemImage: String {
        switch self {
        case .speed: "gauge.with.dots.needle.67percent"
        case .rpm: "engine.combustion.fill"
        case .coolant: "thermometer.medium"
        case .oilTemp: "oilcan.fill"
        case .engineLoad: "engine.combustion.fill"
        case .throttle: "pedal.accelerator"
        case .pedal: "foot.print"
        case .ignitionAdvance: "flame"
        case .catalyst: "flame.fill"
        case .instantConsumption: "drop.fill"
        case .fuelLevel: "fuelpump.fill"
        case .range: "road.lanes"
        case .stft: "waveform.path.ecg"
        case .ltft: "waveform.path.ecg"
        case .maf: "wind"
        case .map: "barometer"
        case .iat: "thermometer.low"
        case .fuelRail: "drop.circle"
        case .lowPressureFuel: "drop.triangle"
        case .ecoScore: "leaf.fill"
        case .boost: "wind"
        case .boostSetpoint: "target"
        case .intercooler: "snowflake"
        case .radiatorOutlet: "thermometer.medium"
        case .ambient: "sun.max"
        case .transmissionOilTemp: "gearshape"
        case .voltage: "bolt.batteryblock.fill"
        case .batterySoc: "battery.100"
        case .alternatorVoltage: "bolt.car"
        case .vanosIntake: "arrow.triangle.2.circlepath"
        case .vanosExhaust: "arrow.triangle.2.circlepath"
        case .oilPressure: "gauge.with.dots.needle.33percent"
        case .vehicleScan: "stethoscope"
        case .parking: "parkingsign.circle.fill"
        case .dailyFuel: "fuelpump.circle.fill"
        }
    }

    var galleryCategory: DashboardWidgetCategory {
        switch self {
        case .speed, .rpm, .coolant, .oilTemp, .engineLoad, .throttle, .pedal,
             .ignitionAdvance, .catalyst, .oilPressure:
            return .engine
        case .instantConsumption, .fuelLevel, .range, .stft, .ltft, .maf, .map, .iat,
             .fuelRail, .lowPressureFuel, .ecoScore:
            return .fuel
        case .boost, .boostSetpoint, .intercooler, .radiatorOutlet, .ambient,
             .transmissionOilTemp, .vanosIntake, .vanosExhaust:
            return .extended
        case .voltage, .batterySoc, .alternatorVoltage:
            return .electrical
        case .vehicleScan, .parking:
            return .actions
        case .dailyFuel:
            return .fuel
        }
    }

    /// OEM / Mode-22 sensors. Never included in the Daily factory layout.
    var isExtendedOEM: Bool {
        switch self {
        case .fuelRail, .lowPressureFuel, .boost, .boostSetpoint,
             .vanosIntake, .vanosExhaust, .transmissionOilTemp, .oilPressure,
             .radiatorOutlet, .intercooler, .alternatorVoltage, .batterySoc:
            return true
        default:
            return false
        }
    }

    var defaultSize: DashboardWidgetSize {
        switch self {
        case .speed, .rpm, .vehicleScan, .parking, .instantConsumption, .dailyFuel:
            return .hero
        default:
            return .small
        }
    }

    /// Two consecutive hero gauges with this flag share one dual GaugeRing row.
    var isPairableHero: Bool {
        switch self {
        case .speed, .rpm, .coolant, .oilTemp, .boost, .voltage, .engineLoad,
             .transmissionOilTemp:
            return true
        default:
            return false
        }
    }

    var alwaysRendersGauge: Bool {
        switch self {
        case .speed, .rpm: return true
        default: return false
        }
    }

    var rendersGaugeWhenHero: Bool {
        switch self {
        case .speed, .rpm, .coolant, .oilTemp, .boost, .voltage, .engineLoad,
             .transmissionOilTemp, .fuelRail:
            return true
        default:
            return false
        }
    }

    var isActionCard: Bool {
        switch self {
        case .vehicleScan, .parking, .dailyFuel: return true
        default: return false
        }
    }
}

enum DashboardWidgetCategory: String, CaseIterable, Sendable {
    case engine
    case fuel
    case extended
    case electrical
    case actions

    var titleKey: String {
        switch self {
        case .engine: "dashboard.gallery.engine"
        case .fuel: "dashboard.gallery.fuel"
        case .extended: "dashboard.gallery.extended"
        case .electrical: "dashboard.gallery.electrical"
        case .actions: "dashboard.gallery.actions"
        }
    }
}
