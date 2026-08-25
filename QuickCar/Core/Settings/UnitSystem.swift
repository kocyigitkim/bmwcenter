import Foundation

enum UnitSystem: String, CaseIterable, Codable, Sendable {
    case metric
    case imperial

    var displayKey: String {
        switch self {
        case .metric: "units.metric"
        case .imperial: "units.imperial"
        }
    }
}

enum ConsumptionUnit: String, CaseIterable, Codable, Sendable {
    case l100km
    case kmPerL
    case mpgUS
    case mpgUK

    var displayKey: String {
        switch self {
        case .l100km: "unit.l100km"
        case .kmPerL: "unit.kmPerL"
        case .mpgUS: "unit.mpgUS"
        case .mpgUK: "unit.mpgUK"
        }
    }
}

enum TemperatureUnit: String, CaseIterable, Codable, Sendable {
    case celsius
    case fahrenheit

    var displayKey: String {
        switch self {
        case .celsius: "unit.celsius"
        case .fahrenheit: "unit.fahrenheit"
        }
    }
}

enum PressureUnit: String, CaseIterable, Codable, Sendable {
    case kpa, bar, psi

    var displayKey: String {
        switch self {
        case .kpa: "unit.kpa"
        case .bar: "unit.bar"
        case .psi: "unit.psi"
        }
    }
}

enum FuelType: String, CaseIterable, Codable, Sendable {
    case gasoline
    case diesel
    case lpg

    var displayKey: String {
        switch self {
        case .gasoline: "fuelType.gasoline"
        case .diesel: "fuelType.diesel"
        case .lpg: "fuelType.lpg"
        }
    }

    var afr: Double {
        switch self {
        case .gasoline: 14.7
        case .diesel: 14.5
        case .lpg: 15.6
        }
    }

    var densityGL: Double {
        switch self {
        case .gasoline: 745
        case .diesel: 832
        case .lpg: 540
        }
    }

    /// MAF(g/s) → L/h coefficient: 3600 / (AFR × density)
    var mafToLh: Double {
        switch self {
        case .gasoline: 0.32880
        case .diesel: 0.29840
        case .lpg: 0.42735
        }
    }
}
