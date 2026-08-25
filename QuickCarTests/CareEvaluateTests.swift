import XCTest
import SwiftData
@testable import QuickCar

@MainActor
final class CareEvaluateTests: XCTestCase {
    private func careContainer() -> ModelContext {
        let schema = Schema([
            BaselineMetric.self, ProtectionEvent.self, CrankRecord.self,
            ThermalEvent.self, MaintenanceLedger.self, Trip.self
        ])
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try! ModelContainer(for: schema, configurations: [config])
        return ModelContext(container)
    }

    func testColdShieldEstimatedOilAtIstanbulWinter() {
        let oil = ColdEngineShield.estimatedOilTemp(
            measured: nil, coolant: 18, ambient: 5, runtimeS: 120, oilGrade: .w5_30
        )
        XCTAssertLessThan(oil, 20)
        let caps = ColdEngineShield.caps(oilTempC: oil, redlineRpm: 7000, diesel: false)
        XCTAssertEqual(caps.rpm ?? -1, 7000 * 0.35, accuracy: 0.01)
    }

    func testColdShieldSkipsRevLimitDuringCatalystWarmup() {
        let shield = ColdEngineShield(modelContext: careContainer())
        var context = CareContext(now: Date(timeIntervalSince1970: 10_000))
        context.ambientC = 5
        context.effectiveAmbientC = 5
        var snap = VehicleSnapshot()
        snap.rpm = 1_600
        snap.speedKmh = 0
        snap.coolantC = 18
        snap.runtimeS = 30
        snap.engineLoadPct = 20
        let cues = shield.evaluate(snapshot: snap, context: &context)
        XCTAssertFalse(cues.contains { $0.id.hasPrefix("cold.v") })
        XCTAssertTrue(context.isColdPhase)
    }

    func testColdShieldFlagsHighRPMAfterWarmupWindow() {
        let shield = ColdEngineShield(modelContext: careContainer())
        let t0 = Date(timeIntervalSince1970: 11_000)
        var context = CareContext(now: t0)
        context.ambientC = 5
        var snap = VehicleSnapshot()
        snap.speedKmh = 20
        snap.coolantC = 25
        snap.runtimeS = 120
        snap.engineLoadPct = 40
        snap.rpm = 4_200
        _ = shield.evaluate(snapshot: snap, context: &context)
        context.now = t0.addingTimeInterval(1.6)
        snap.runtimeS = 121.6
        let cues = shield.evaluate(snapshot: snap, context: &context)
        XCTAssertTrue(
            cues.contains { $0.id == "cold.v1" || $0.id == "cold.v2" },
            "cold high-RPM after catalyst warmup should cue (got \(cues.map(\.id)))"
        )
        XCTAssertEqual(shield.coldViolationsThisTrip, 1)
    }

    func testBatteryGuardianWeakRestVsHealthyCharging() {
        let guardian = BatteryGuardian(modelContext: careContainer())
        let t0 = Date(timeIntervalSince1970: 12_000)
        var context = CareContext(now: t0)
        context.profile = VehicleArchetypeDefaults.profile(
            for: .gasolineTurboDI, fuel: .gasoline, isTurbo: true
        )

        var parked = VehicleSnapshot()
        parked.rpm = 0
        parked.voltage = 12.10
        for i in 0..<6 {
            context.now = t0.addingTimeInterval(Double(i))
            _ = guardian.evaluate(snapshot: parked, context: &context)
        }

        var crank = parked
        crank.rpm = 900
        crank.voltage = 12.10
        context.now = t0.addingTimeInterval(6)
        let weakCues = guardian.evaluate(snapshot: crank, context: &context)
        XCTAssertTrue(
            weakCues.contains { $0.id == "battery.deep" },
            "overnight ~12.1V on EFB (deep 12.20) should alarm after crank"
        )

        let healthy = BatteryGuardian(modelContext: careContainer())
        var context2 = CareContext(now: t0)
        context2.profile = context.profile
        var rest = VehicleSnapshot()
        rest.rpm = 0
        rest.voltage = 12.70
        for i in 0..<6 {
            context2.now = t0.addingTimeInterval(Double(i))
            _ = healthy.evaluate(snapshot: rest, context: &context2)
        }
        var start = rest
        start.rpm = 900
        start.voltage = 12.70
        context2.now = t0.addingTimeInterval(6)
        _ = healthy.evaluate(snapshot: start, context: &context2)

        var running = VehicleSnapshot()
        running.rpm = 1_800
        running.voltage = 14.2
        running.engineLoadPct = 40
        var chargingCues: [CareCue] = []
        for i in 0..<70 {
            context2.now = t0.addingTimeInterval(10 + Double(i))
            chargingCues += healthy.evaluate(snapshot: running, context: &context2)
        }
        XCTAssertFalse(chargingCues.contains { $0.id == "battery.chargingLow" })
        XCTAssertFalse(chargingCues.contains { $0.id == "battery.deep" })
    }

    func testThermostatHighwayCooling() {
        let ctx = careContainer()
        let watch = ThermostatWatch(
            baseline: BaselineLearner(modelContext: ctx),
            modelContext: ctx
        )
        let t0 = Date(timeIntervalSince1970: 13_000)
        var context = CareContext(now: t0)
        context.effectiveAmbientC = 15
        var snap = VehicleSnapshot()
        snap.rpm = 2_200
        snap.speedKmh = 110
        snap.coolantC = 70
        snap.engineLoadPct = 30
        _ = watch.evaluate(snapshot: snap, context: &context)
        context.now = t0.addingTimeInterval(300)
        let cues = watch.evaluate(snapshot: snap, context: &context)
        XCTAssertTrue(cues.contains { $0.id == "thermostat.highway" })
        XCTAssertTrue(watch.caughtFault)
    }

    func testThermalShockProfileFactor() {
        let turbo = VehicleArchetypeDefaults.profile(for: .gasolineTurboDI, fuel: .gasoline, isTurbo: true)
        XCTAssertEqual(ThermalShockGuard.profileFactor(profile: turbo), 0.5, accuracy: 0.01)
        let na = VehicleArchetypeDefaults.profile(for: .gasolineNA, fuel: .gasoline, isTurbo: false)
        XCTAssertEqual(ThermalShockGuard.profileFactor(profile: na), 0.0, accuracy: 0.01)
        let diesel = VehicleArchetypeDefaults.profile(for: .dieselDPF, fuel: .diesel, isTurbo: true)
        XCTAssertEqual(ThermalShockGuard.profileFactor(profile: diesel), 0.6, accuracy: 0.01)
    }

    func testFuelTrimDoesNotAlertBeforeThreeLongTrips() {
        let ctx = careContainer()
        let monitor = FuelTrimMonitor(baseline: BaselineLearner(modelContext: ctx), modelContext: ctx)
        let t0 = Date(timeIntervalSince1970: 14_000)
        var context = CareContext(now: t0)
        context.lastRefuelAt = t0.addingTimeInterval(-1_200)

        func feed(seconds: Int) {
            for i in 0..<seconds {
                context.now = t0.addingTimeInterval(Double(i))
                var idle = VehicleSnapshot()
                idle.ltftBank1 = 18
                idle.stftBank1 = 8
                idle.coolantC = 92
                idle.fuelLevelPct = 40
                idle.engineLoadPct = 18
                idle.speedKmh = 0
                idle.rpm = 800
                _ = monitor.evaluate(snapshot: idle, context: &context)
                var part = idle
                part.engineLoadPct = 40
                part.speedKmh = 40
                part.rpm = 1_800
                _ = monitor.evaluate(snapshot: part, context: &context)
            }
        }

        feed(seconds: 8)
        let trip = Trip()
        trip.durationS = 400
        let first = monitor.onTripEnded(trip: trip, context: context)
        XCTAssertTrue(first.isEmpty, "one trip must not raise a trim alert")
        XCTAssertFalse(FuelTrimMonitor.validateAlert(tripCount: 1, durationS: 400, postRefuelS: 1_200))
        XCTAssertTrue(FuelTrimMonitor.validateAlert(tripCount: 3, durationS: 1_200, postRefuelS: 700))
    }

    func testCareFeatureUnavailableWhenRequiredPIDsMissing() {
        let shield = ColdEngineShield(modelContext: careContainer())
        XCTAssertTrue(shield.isAvailable(supportedPIDs: []))
        XCTAssertFalse(shield.isAvailable(supportedPIDs: [0x0C]))
        XCTAssertTrue(shield.isAvailable(supportedPIDs: [0x05, 0x0C, 0x04]))
        XCTAssertNotNil(shield.unavailableReason(supportedPIDs: [0x0C]))
    }

    func testEngineReadyCelebratesOnceWhenHot() {
        let ready = EngineReadyService()
        var context = CareContext(now: Date(timeIntervalSince1970: 15_000))
        context.ambientC = 15
        context.oilTempC = 92
        var snap = VehicleSnapshot()
        snap.coolantC = 90
        snap.runtimeS = 500
        snap.engineLoadPct = 50
        let first = ready.evaluate(snapshot: snap, context: &context)
        XCTAssertTrue(first.contains { $0.id == "ready.reached" })
        XCTAssertTrue(ready.isReady)
        let second = ready.evaluate(snapshot: snap, context: &context)
        XCTAssertFalse(second.contains { $0.id == "ready.reached" })
    }
}
