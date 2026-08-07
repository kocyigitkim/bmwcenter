import Foundation

struct ScoreBreakdown: Sendable, Equatable, Codable {
    var acceleration: Double = 25
    var braking: Double = 25
    var cornering: Double = 10
    var speed: Double = 15
    var idle: Double = 10
    var efficiency: Double = 15

    var total: Double {
        max(0, min(100, acceleration + braking + cornering + speed + idle + efficiency))
    }

    var worstComponentKey: String {
        let pairs: [(String, Double, Double)] = [
            ("score.acceleration", acceleration, 25),
            ("score.braking", braking, 25),
            ("score.cornering", cornering, 10),
            ("score.speed", speed, 15),
            ("score.idle", idle, 10),
            ("score.efficiency", efficiency, 15)
        ]
        return pairs.max(by: { ($0.2 - $0.1) < ($1.2 - $1.1) })?.0 ?? "score.efficiency"
    }

    var tipKey: String {
        switch worstComponentKey {
        case "score.braking": return "score.tip.braking"
        case "score.acceleration": return "score.tip.acceleration"
        case "score.idle": return "score.tip.idle"
        case "score.speed": return "score.tip.speed"
        case "score.cornering": return "score.tip.cornering"
        default: return "score.tip.efficiency"
        }
    }

    var badgeKey: String {
        switch total {
        case 90...: return "score.badge.smooth"
        case 75..<90: return "score.badge.steady"
        case 60..<75: return "score.badge.mixed"
        default: return "score.badge.aggressive"
        }
    }
}

enum DrivingScorer {
    static func score(
        distanceKm: Double,
        events: [DetectedEvent],
        overspeedDurationRatio: Double,
        idleRatio: Double,
        avgL100: Double?,
        baselineL100: Double?
    ) -> ScoreBreakdown {
        let dist = max(distanceKm, 1)
        func density(_ kind: DetectedEvent.Kind) -> Double {
            let count = events
                .filter { $0.kind == kind }
                .reduce(0.0) { $0 + ($1.severity == .severe ? 2.0 : 1.0) }
            return count / dist * 100
        }

        var b = ScoreBreakdown()
        b.acceleration = max(0, 25 - min(25, density(.harshAccel) * 2.5))
        b.braking = max(0, 25 - min(25, density(.harshBrake) * 3.0))
        b.cornering = max(0, 10 - min(10, density(.harshCorner) * 2.0))
        b.speed = max(0, 15 - min(15, overspeedDurationRatio * 60))
        b.idle = max(0, 10 - min(10, max(0, idleRatio - 0.10) * 50))
        let baseline = baselineL100 ?? 7.5
        if let avgL100, baseline > 0 {
            b.efficiency = max(0, 15 - min(15, max(0, avgL100 / baseline - 1.0) * 40))
        }
        return b
    }
}
