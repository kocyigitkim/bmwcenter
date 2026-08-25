import XCTest
@testable import QuickCar

final class DrivingScorerTests: XCTestCase {
    func testPerfectTripIsNear100() {
        let score = DrivingScorer.score(
            distanceKm: 100,
            events: [],
            overspeedDurationRatio: 0,
            idleRatio: 0.05,
            avgL100: 7.5,
            baselineL100: 7.5
        )
        XCTAssertEqual(score.total, 100, accuracy: 0.01)
        XCTAssertEqual(score.badgeKey, "score.badge.smooth")
    }

    func testHarshAccelPenaltyNormalizedPer100Km() {
        let events = [
            DetectedEvent(kind: .harshAccel, t: .now, severity: .normal, speedKmh: 40, magnitude: 2.8),
            DetectedEvent(kind: .harshAccel, t: .now, severity: .severe, speedKmh: 50, magnitude: 3.8)
        ]
        // n = (1+2)/50*100 = 6; penalty = min(25, 6*2.5)=15 → accel=10
        let score = DrivingScorer.score(
            distanceKm: 50,
            events: events,
            overspeedDurationRatio: 0,
            idleRatio: 0,
            avgL100: 7.5,
            baselineL100: 7.5
        )
        XCTAssertEqual(score.acceleration, 10, accuracy: 0.01)
    }

    func testIdlePenaltyStartsAfter10Percent() {
        let low = DrivingScorer.score(
            distanceKm: 10, events: [], overspeedDurationRatio: 0,
            idleRatio: 0.10, avgL100: nil, baselineL100: nil
        )
        let high = DrivingScorer.score(
            distanceKm: 10, events: [], overspeedDurationRatio: 0,
            idleRatio: 0.30, avgL100: nil, baselineL100: nil
        )
        XCTAssertEqual(low.idle, 10, accuracy: 0.01)
        // min(10, (0.2)*50)=10 → idle 0
        XCTAssertEqual(high.idle, 0, accuracy: 0.01)
    }

    func testBadgeBoundaries() {
        var b = ScoreBreakdown(acceleration: 25, braking: 25, cornering: 10, speed: 15, idle: 10, efficiency: 5)
        XCTAssertEqual(b.total, 90)
        XCTAssertEqual(b.badgeKey, "score.badge.smooth")
        b.efficiency = 0
        b.idle = 0
        // 75
        b = ScoreBreakdown(acceleration: 25, braking: 25, cornering: 10, speed: 15, idle: 0, efficiency: 0)
        XCTAssertEqual(b.badgeKey, "score.badge.steady")
    }
}
