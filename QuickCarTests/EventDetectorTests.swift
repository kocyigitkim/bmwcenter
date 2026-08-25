import XCTest
@testable import QuickCar

@MainActor
final class EventDetectorTests: XCTestCase {
    func testHarshBrakingSevere() {
        let detector = EventDetector(useMotion: false)
        let t0 = Date()
        // Build 3 samples with ~ -4.8 m/s²
        // Δv m/s over 0.4s: a = -4.8 → Δv = -1.92 m/s → -6.912 km/h across window ends
        _ = detector.evaluate(snapshot: snap(speed: 60, rpm: 2000, coolant: 90), now: t0)
        _ = detector.evaluate(snapshot: snap(speed: 56, rpm: 2000, coolant: 90), now: t0.addingTimeInterval(0.2))
        let events = detector.evaluate(snapshot: snap(speed: 50, rpm: 2000, coolant: 90), now: t0.addingTimeInterval(0.4))
        // a = ((50-60)/3.6)/0.4 = -6.94 → severe brake
        XCTAssertTrue(events.contains { $0.kind == .harshBrake && $0.severity == .severe })
    }

    func testOverrevWhenCold() {
        let detector = EventDetector(useMotion: false)
        let events = detector.evaluate(snapshot: snap(speed: 0, rpm: 5000, coolant: 40), now: .now)
        XCTAssertTrue(events.contains { $0.kind == .overrev })
    }

    func testNoOverrevWhenWarm() {
        let detector = EventDetector(useMotion: false)
        let events = detector.evaluate(snapshot: snap(speed: 0, rpm: 5000, coolant: 90), now: .now)
        XCTAssertFalse(events.contains { $0.kind == .overrev })
    }

    func testOverheatSeverity() {
        let detector = EventDetector(useMotion: false)
        let warn = detector.evaluate(snapshot: snap(speed: 40, rpm: 2000, coolant: 110), now: .now)
        XCTAssertTrue(warn.contains { $0.kind == .overheat && $0.severity == .normal })
        let severe = detector.evaluate(snapshot: snap(speed: 40, rpm: 2000, coolant: 120), now: .now)
        XCTAssertTrue(severe.contains { $0.kind == .overheat && $0.severity == .severe })
    }

    private func snap(speed: Double, rpm: Double, coolant: Double) -> VehicleSnapshot {
        var s = VehicleSnapshot()
        s.speedKmh = speed
        s.rpm = rpm
        s.coolantC = coolant
        return s
    }
}
