import XCTest
@testable import QuickCar

@MainActor
final class SignalGateTests: XCTestCase {
    private func turboProfile() -> VehicleDiagnosticProfile {
        VehicleArchetypeDefaults.profile(for: .gasolineTurboDI, fuel: .gasoline, isTurbo: true)
    }

    func testFirstSampleIsHealthy() {
        let gate = SignalGate()
        var snap = VehicleSnapshot()
        snap.coolantC = 90
        snap.engineLoadPct = 40
        let now = Date(timeIntervalSince1970: 1_000)
        let result = gate.evaluate(snapshot: snap, profile: turboProfile(), now: now)
        XCTAssertTrue(result.canHealthy)
        XCTAssertEqual(result.normLoad ?? 0, 40, accuracy: 0.01)
    }

    func testCANDropoutAfterGap() {
        let gate = SignalGate()
        var snap = VehicleSnapshot()
        snap.coolantC = 90
        let t0 = Date(timeIntervalSince1970: 2_000)
        _ = gate.evaluate(snapshot: snap, profile: turboProfile(), now: t0)
        let later = gate.evaluate(
            snapshot: snap,
            profile: turboProfile(),
            now: t0.addingTimeInterval(SignalGate.canDropoutS + 0.5)
        )
        XCTAssertFalse(later.canHealthy)
    }

    func testRejectsSensorDefaultAndStuckCoolant() {
        let gate = SignalGate()
        let t0 = Date(timeIntervalSince1970: 3_000)
        XCTAssertFalse(gate.isValid(key: "coolant", value: -40, now: t0))
        XCTAssertFalse(gate.isValid(key: "coolant", value: 0, now: t0))
        XCTAssertFalse(gate.isValid(key: "coolant", value: 215, now: t0))

        var snap = VehicleSnapshot()
        snap.coolantC = 91
        _ = gate.evaluate(snapshot: snap, profile: turboProfile(), now: t0)
        _ = gate.evaluate(
            snapshot: snap,
            profile: turboProfile(),
            now: t0.addingTimeInterval(1)
        )
        XCTAssertFalse(
            gate.isValid(key: "coolant", value: 91, now: t0.addingTimeInterval(SignalGate.stuckWindowS + 1))
        )
        XCTAssertTrue(gate.isValid(key: "coolant", value: 91, now: t0.addingTimeInterval(5)))
    }

    func testAmbientFromIATWhenHighwayAndNoAmbientPID() {
        let gate = SignalGate()
        var snap = VehicleSnapshot()
        snap.intakeAirC = 12
        snap.speedKmh = 80
        let result = gate.evaluate(
            snapshot: snap,
            profile: turboProfile(),
            now: Date(timeIntervalSince1970: 4_000)
        )
        XCTAssertEqual(result.effectiveAmbientC, 12)
    }

    func testDPFRegenWhenCatalystHot() {
        let profile = VehicleArchetypeDefaults.profile(for: .dieselDPF, fuel: .diesel, isTurbo: true)
        XCTAssertTrue(profile.hasDPF)
        let gate = SignalGate()
        var snap = VehicleSnapshot()
        snap.catalystC = 600
        let result = gate.evaluate(
            snapshot: snap,
            profile: profile,
            now: Date(timeIntervalSince1970: 5_000)
        )
        XCTAssertTrue(result.regenActive)
    }

    func testNALoadIsCappedNotNormalized() {
        let gate = SignalGate()
        let na = VehicleArchetypeDefaults.profile(for: .gasolineNA, fuel: .gasoline, isTurbo: false)
        var snap = VehicleSnapshot()
        snap.engineLoadPct = 40
        let result = gate.evaluate(
            snapshot: snap,
            profile: na,
            now: Date(timeIntervalSince1970: 6_000)
        )
        XCTAssertEqual(result.normLoad ?? -1, 40, accuracy: 0.01)
    }
}
