import Foundation
import ActivityKit

struct TripActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var distanceKm: Double
        var durationS: Double
        var fuelUsedL: Double
        var avgL100: Double
        var speedKmh: Double
        var score: Double?
    }

    var startedAt: Date
    var vehicleName: String
}
