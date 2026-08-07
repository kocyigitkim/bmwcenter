import Foundation
import SwiftData

@MainActor
final class BadgeService {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func awardedKeys() -> Set<String> {
        let rows = (try? modelContext.fetch(FetchDescriptor<BadgeAward>())) ?? []
        return Set(rows.map(\.badgeKey))
    }

    /// Awards only when vehicle is stopped. Returns new badge keys.
    @discardableResult
    func evaluateAwards(
        isStopped: Bool,
        cleanWarmups: Int,
        compliantCooldowns: Int,
        harshAccelKm: Double,
        tripCount: Int,
        longHaulKm: Double,
        thermostatCaught: Bool
    ) -> [String] {
        guard isStopped else { return [] }
        var newly: [String] = []
        func award(_ key: String, progress: Double) {
            guard !awardedKeys().contains(key) else { return }
            modelContext.insert(BadgeAward(badgeKey: key, progressSnapshot: progress))
            newly.append(key)
        }
        if cleanWarmups >= 25 { award("coldBlooded", progress: Double(cleanWarmups)) }
        if compliantCooldowns >= 50 { award("turboWhisperer", progress: Double(compliantCooldowns)) }
        if harshAccelKm >= 1000 { award("featherFoot", progress: harshAccelKm) }
        if thermostatCaught { award("thermostatSentinel", progress: 1) }
        if tripCount >= 100 { award("century", progress: Double(tripCount)) }
        if longHaulKm >= 300 { award("longHauler", progress: longHaulKm) }
        if !newly.isEmpty { try? modelContext.save() }
        return newly
    }

    static func titleKey(for badgeKey: String) -> String {
        switch badgeKey {
        case "coldBlooded": return "badge.coldBlooded"
        case "turboWhisperer": return "badge.turboWhisperer"
        case "featherFoot": return "badge.featherFoot"
        case "thermostatSentinel": return "badge.thermostatSentinel"
        case "century": return "badge.century"
        case "frugal": return "badge.frugal"
        case "longHauler": return "badge.longHauler"
        default: return "badge.\(badgeKey)"
        }
    }
}
