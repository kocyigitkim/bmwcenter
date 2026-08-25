import Foundation

struct IdleStats: Sendable, Equatable {
    var idleDurationS: Double
    var idleFuelL: Double
    var idleCost: Double
    var idleRatio: Double
}

enum IdleAnalyzer {
    static func analyze(trips: [Trip], pricePerLiter: Double) -> IdleStats {
        let idleDuration = trips.reduce(0) { $0 + $1.idleDurationS }
        let idleFuel = trips.reduce(0) { $0 + $1.idleFuelL }
        let duration = trips.reduce(0) { $0 + $1.durationS }
        return IdleStats(
            idleDurationS: idleDuration,
            idleFuelL: idleFuel,
            idleCost: idleFuel * pricePerLiter,
            idleRatio: duration > 0 ? idleDuration / duration : 0
        )
    }
}
