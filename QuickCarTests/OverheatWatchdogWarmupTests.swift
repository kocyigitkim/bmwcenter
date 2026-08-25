import XCTest
import SwiftData
@testable import QuickCar

/// Covers a real-world false-positive reported against OverheatWatchdog: a
/// normal cold-start warm-up climb (thermostat still closed, coolant rising
/// while idling) was indistinguishable from a genuine cooling-system fault,
/// because the rapid-rise/fan-suspect checks only looked at delta-over-time,
/// never the absolute coolant value. Engines intentionally run coolant up to
/// operating temperature before the thermostat opens — that rise is normal
/// and must not be flagged (PRD §6.2: vehicle-specific behavior over generic
/// thresholds).
@MainActor
final class OverheatWatchdogWarmupTests: XCTestCase {
    private func makeWatchdog() -> OverheatWatchdog {
        let schema = Schema([BaselineMetric.self, ProtectionEvent.self])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try! ModelContainer(for: schema, configurations: [config])
        let context = ModelContext(container)
        let baseline = BaselineLearner(modelContext: context)
        return OverheatWatchdog(baseline: baseline, modelContext: context)
    }

    private func snapshot(coolantC: Double, speedKmh: Double, rpm: Double = 1500) -> VehicleSnapshot {
        var snap = VehicleSnapshot()
        snap.coolantC = coolantC
        snap.speedKmh = speedKmh
        snap.rpm = rpm
        return snap
    }

    /// Advances the engine past the post-start "distrust readings" grace
    /// window before the scenario under test begins.
    private func pastStartupGrace(_ watchdog: OverheatWatchdog, at now: Date) {
        var context = CareContext(now: now)
        _ = watchdog.evaluate(snapshot: snapshot(coolantC: 25, speedKmh: 0), context: &context)
        context.now = now.addingTimeInterval(9)
        _ = watchdog.evaluate(snapshot: snapshot(coolantC: 25, speedKmh: 0), context: &context)
    }

    func testColdWarmupClimbWhileIdleDoesNotTriggerFanSuspect() {
        let watchdog = makeWatchdog()
        let start = Date()
        pastStartupGrace(watchdog, at: start)

        // Normal cold warm-up: 30°C -> 38°C over 90s while idling. Thermostat
        // is still closed at these temperatures on virtually any engine.
        var context = CareContext(now: start.addingTimeInterval(10))
        var allCues: [CareCue] = []
        for step in 0...9 {
            let t = start.addingTimeInterval(10 + Double(step) * 10)
            context.now = t
            let coolant = 30.0 + Double(step) * (8.0 / 9.0)
            allCues += watchdog.evaluate(snapshot: snapshot(coolantC: coolant, speedKmh: 0), context: &context)
        }
        XCTAssertFalse(
            allCues.contains { $0.id == "overheat.fan" },
            "cold warm-up climb while idling must not be flagged as a fan fault"
        )
        XCTAssertFalse(allCues.contains { $0.id == "overheat.alarm" })
    }

    func testWarmedUpRapidRiseWhileIdleStillTriggersFanSuspect() {
        let watchdog = makeWatchdog()
        let start = Date()
        pastStartupGrace(watchdog, at: start)

        // Get the engine to just-warmed-up baseline first (96°C, stable — above the
        // default profile's thermostatOpenC so `isWarmedUp` is already true).
        // Jump the clock well past the plausible-delta window (5s) first so
        // this large one-off jump from the 25°C startup reading isn't itself
        // rejected as an implausible sensor glitch.
        var context = CareContext(now: start.addingTimeInterval(20))
        _ = watchdog.evaluate(snapshot: snapshot(coolantC: 96, speedKmh: 0), context: &context)

        // Now a real rise from an already-warm baseline while idling, past the
        // default profile's effectiveFanOnC (102) + 4 threshold — this is the
        // scenario the fan-suspect check exists to catch.
        var allCues: [CareCue] = []
        for step in 1...9 {
            let t = start.addingTimeInterval(20 + Double(step) * 10)
            context.now = t
            let coolant = 96.0 + Double(step) * (14.0 / 9.0)
            allCues += watchdog.evaluate(snapshot: snapshot(coolantC: coolant, speedKmh: 0), context: &context)
        }
        XCTAssertTrue(
            allCues.contains { $0.id == "overheat.fan" },
            "a genuine rise from an already-warm baseline while idling should still be flagged"
        )
    }
}
