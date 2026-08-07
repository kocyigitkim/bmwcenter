import Foundation

enum CueSeverity: String, Sendable, Comparable {
    case celebration
    case coach
    case protective
    case critical

    private var rank: Int {
        switch self {
        case .celebration: return 0
        case .coach: return 1
        case .protective: return 2
        case .critical: return 3
        }
    }

    static func < (lhs: CueSeverity, rhs: CueSeverity) -> Bool {
        lhs.rank < rhs.rank
    }
}

struct CareCue: Identifiable, Sendable, Equatable {
    let id: String
    let text: String
    let severity: CueSeverity
    let localizationKey: String
    var chipTitle: String?

    init(
        id: String,
        text: String,
        severity: CueSeverity,
        localizationKey: String = "",
        chipTitle: String? = nil
    ) {
        self.id = id
        self.text = text
        self.severity = severity
        self.localizationKey = localizationKey.isEmpty ? id : localizationKey
        self.chipTitle = chipTitle
    }
}

struct CareChannelPlan: Sendable, Equatable {
    var speak: Bool
    var carPlayRow: Bool
    var carPlayAlert: Bool
    var phoneChip: Bool
    var fullScreen: Bool
    var notification: Bool
    var haptic: String?
    var toneCount: Int
}

struct CareContext: Sendable {
    var now: Date = .now
    var supportedPIDs: Set<UInt8> = []
    var ambientC: Double?
    var oilTempC: Double?
    var oilIsEstimated: Bool = true
    var engineReady: Bool = false
    var readiness: Double = 0
    var isColdPhase: Bool = true
    var isCityTraffic: Bool = false
    var tripDistanceKm: Double = 0
    var tripDurationS: Double = 0
    var isVehicleStopped: Bool = true
    var fuelType: FuelType = .gasoline
    var isTurbo: Bool = true
    var sensitivityOffsetC: Double = 0
    var liveEcoScore: Double = 100
    var thermalCountdownS: Double?
    var lastRefuelAt: Date?
}

enum CareBucket {
    static func ambient(_ c: Double?) -> String {
        guard let c else { return "ambient:unknown" }
        switch c {
        case ..<0: return "ambient:<0"
        case 0..<10: return "ambient:0-10"
        case 10..<20: return "ambient:10-20"
        case 20..<30: return "ambient:20-30"
        default: return "ambient:>30"
        }
    }

    static func load(_ pct: Double?) -> String {
        guard let pct else { return "load:unknown" }
        switch pct {
        case ..<40: return "load:<40"
        case 40..<70: return "load:40-70"
        default: return "load:>70"
        }
    }

    static func speed(_ kmh: Double?) -> String {
        guard let kmh else { return "speed:unknown" }
        switch kmh {
        case ..<0.5: return "speed:0"
        case 0.5..<50: return "speed:1-50"
        case 50..<90: return "speed:50-90"
        default: return "speed:>90"
        }
    }

    static func composite(ambient: Double?, load: Double?, speed: Double?) -> String {
        [self.ambient(ambient), self.load(load), self.speed(speed)].joined(separator: "|")
    }
}

enum LocalizedCare {
    static func string(_ key: String, _ args: CVarArg...) -> String {
        let format = String(localized: String.LocalizationValue(key), table: "Localizable")
        guard !args.isEmpty else { return format }
        return String(format: format, locale: .current, arguments: args)
    }
}
