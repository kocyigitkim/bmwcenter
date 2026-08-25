import XCTest
@testable import QuickCar

final class AlertGuidanceTests: XCTestCase {
    func testFuelAirGuidanceIsLocalizedNotRawKey() {
        let text = DTCGuidance.text(system: "fuelAir", severity: "high")
        XCTAssertFalse(text.isEmpty)
        XCTAssertFalse(text.hasPrefix("dtc.guidance."), "missing catalog key leaked: \(text)")
    }

    func testUnknownSystemFallsBackToOther() {
        let text = DTCGuidance.text(system: "notASystem", severity: "medium")
        XCTAssertFalse(text.isEmpty)
        XCTAssertFalse(text.contains("notASystem"))
        XCTAssertFalse(text.hasPrefix("dtc.guidance."), "fallback leaked key: \(text)")
        XCTAssertEqual(text, DTCGuidance.text(system: "other", severity: "medium"))
    }

    func testAlertRulesCoolantFuelVoltageAndTrim() {
        let profile = VehicleProfileSnapshot(tankCapacityL: 60)
        var snap = VehicleSnapshot()

        snap.coolantC = 100
        XCTAssertFalse(rule("coolant.high").evaluate(snap, profile))
        snap.coolantC = 106
        XCTAssertTrue(rule("coolant.high").evaluate(snap, profile))
        snap.coolantC = 116
        XCTAssertTrue(rule("coolant.critical").evaluate(snap, profile))

        snap = VehicleSnapshot()
        snap.fuelLevelPct = 20
        XCTAssertFalse(rule("fuel.low").evaluate(snap, profile))
        snap.fuelLevelPct = 10
        XCTAssertTrue(rule("fuel.low").evaluate(snap, profile))
        snap.fuelLevelPct = 4
        XCTAssertTrue(rule("fuel.critical").evaluate(snap, profile))

        snap = VehicleSnapshot()
        snap.rpm = 1500
        snap.voltage = 14.2
        XCTAssertFalse(rule("voltage.charging").evaluate(snap, profile))
        snap.voltage = 12.8
        XCTAssertTrue(rule("voltage.charging").evaluate(snap, profile))

        snap = VehicleSnapshot()
        snap.ltftBank1 = 8
        XCTAssertFalse(rule("trim.high").evaluate(snap, profile))
        snap.ltftBank1 = 22
        XCTAssertTrue(rule("trim.high").evaluate(snap, profile))

        snap = VehicleSnapshot()
        snap.rpm = 3500
        snap.coolantC = 40
        XCTAssertTrue(rule("rpm.coldHigh").evaluate(snap, profile))
        snap.coolantC = 90
        XCTAssertFalse(rule("rpm.coldHigh").evaluate(snap, profile))
    }

    func testNewDTCRuleIsEngineTriggeredOnly() {
        XCTAssertFalse(rule("dtc.new").evaluate(VehicleSnapshot(), VehicleProfileSnapshot()))
    }

    func testSeverityRouterCriticalIsFullScreen() {
        let critical = SeverityRouter.plan(for: .critical)
        XCTAssertTrue(critical.fullScreen)
        XCTAssertTrue(critical.carPlayAlert)
        XCTAssertEqual(critical.toneCount, 2)
        XCTAssertEqual(SeverityRouter.alertSeverity(from: .critical), .critical)

        let protective = SeverityRouter.plan(for: .protective)
        XCTAssertFalse(protective.fullScreen)
        XCTAssertEqual(SeverityRouter.alertSeverity(from: .protective), .warning)
        XCTAssertEqual(SeverityRouter.alertSeverity(from: .coach), .info)
    }

    func testProfileConfidenceTiers() {
        XCTAssertEqual(ProfileConfidenceTier.forTrips(0, minutes: 0, hasMatureBaseline: false), .t0)
        XCTAssertEqual(ProfileConfidenceTier.forTrips(3, minutes: 40, hasMatureBaseline: false), .t1)
        XCTAssertEqual(ProfileConfidenceTier.forTrips(30, minutes: 400, hasMatureBaseline: true), .t2)
        XCTAssertTrue(ProfileConfidenceTier.t0 < ProfileConfidenceTier.t1)
    }

    private func rule(_ id: String) -> AlertRule {
        AlertRules.builtIn.first { $0.id == id }!
    }
}
