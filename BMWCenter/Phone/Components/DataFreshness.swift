import Foundation

enum DataFreshness: Equatable, Sendable {
    case live
    case stale
    case unavailable
    case disconnected
    case error

    static func from(timestamp: Date?, connected: Bool, supported: Bool = true, failed: Bool = false) -> DataFreshness {
        if failed { return .error }
        if !supported { return .unavailable }
        if !connected { return .disconnected }
        guard let timestamp else { return .disconnected }
        let age = Date.now.timeIntervalSince(timestamp)
        if age < 1.5 { return .live }
        if age < 5 { return .stale }
        return .stale
    }

    var accessibilityLabel: String {
        switch self {
        case .live: String(localized: "data.freshness.live", table: "Localizable")
        case .stale: String(localized: "data.freshness.stale", table: "Localizable")
        case .unavailable: String(localized: "data.notSupported", table: "Localizable")
        case .disconnected: String(localized: "connection.disconnected", table: "Localizable")
        case .error: String(localized: "data.readFailed", table: "Localizable")
        }
    }
}
