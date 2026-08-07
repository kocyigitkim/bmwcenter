import Foundation

struct WidgetSnapshot: Codable, Sendable {
    var fuelLevelPct: Double?
    var estimatedRangeKm: Double?
    var lastTripDistanceKm: Double?
    var lastTripDurationS: Double?
    var lastTripL100: Double?
    var lastTripScore: Double?
    var updatedAt: Date
}

enum WidgetDataStore {
    static let suiteName = "group.com.muhammetkocyigit.bmwcenter"
    private static let key = "widget.snapshot"

    static func write(_ snapshot: WidgetSnapshot) {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: key)
    }

    static func save(_ snapshot: WidgetSnapshot) { write(snapshot) }

    static func read() -> WidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    static func load() -> WidgetSnapshot? { read() }
}
