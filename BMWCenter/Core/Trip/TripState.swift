import Foundation

enum TripState: Equatable, Sendable {
    case idle
    case armed
    case recording(UUID)
    case paused(UUID)

    var activeID: UUID? {
        switch self {
        case .recording(let id), .paused(let id): return id
        default: return nil
        }
    }

    var isActive: Bool {
        activeID != nil
    }
}

struct LiveTripMetrics: Equatable, Sendable {
    var startedAt: Date?
    var durationS: Double = 0
    var distanceKm: Double = 0
    var fuelUsedL: Double = 0
    var avgL100: Double?
    var avgSpeedKmh: Double = 0
    var maxSpeedKmh: Double = 0
    var maxRpm: Double = 0
    var idleDurationS: Double = 0
}
