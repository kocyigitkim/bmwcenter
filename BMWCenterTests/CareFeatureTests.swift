import XCTest
@testable import BMWCenter

@MainActor
final class CareFeatureTests: XCTestCase {
    func testOilTempEstimatorAnchors() {
        var est = OilTempEstimator()
        let (_, estimated) = est.update(
            measuredOilC: nil,
            coolantC: 40,
            ambientC: 10,
            engineLoadPct: 30,
            isRunning: true,
            now: Date()
        )
        XCTAssertTrue(estimated)
        // After long run with hot coolant, oil capped near coolant-4
        var late = OilTempEstimator()
        let start = Date().addingTimeInterval(-2000)
        // Simulate by updating once with hot coolant (model uses startedAt from first call)
        _ = late.update(
            measuredOilC: nil,
            coolantC: 90,
            ambientC: 10,
            engineLoadPct: 40,
            isRunning: true,
            now: start
        )
        let (oil, _) = late.update(
            measuredOilC: nil,
            coolantC: 92,
            ambientC: 10,
            engineLoadPct: 40,
            isRunning: true,
            now: start.addingTimeInterval(2000)
        )
        XCTAssertNotNil(oil)
        XCTAssertLessThanOrEqual(oil!, 92 - 4 + 0.1)
    }

    func testEngineReadyHysteresisFormula() {
        let cold = EngineReadyService.computeReadiness(
            coolantC: 20, oilC: 20, ambientC: 15, runtimeS: 10, avgLoad3min: 10
        )
        XCTAssertLessThan(cold, 0.5)
        let hot = EngineReadyService.computeReadiness(
            coolantC: 90, oilC: 92, ambientC: 15, runtimeS: 500, avgLoad3min: 50
        )
        XCTAssertGreaterThanOrEqual(hot, 0.98)
    }

    func testColdCaps() {
        let c = ColdEngineShield.caps(oilTempC: 15, diesel: false)
        XCTAssertEqual(c.rpm, 2300)
        XCTAssertEqual(c.load, 45)
        let hot = ColdEngineShield.caps(oilTempC: 90, diesel: false)
        XCTAssertNil(hot.rpm)
    }

    func testTLIAndIdle() {
        let now = Date()
        var samples: [(Date, Double)] = []
        for i in 0..<300 {
            samples.append((now.addingTimeInterval(Double(i)), 1.0))
        }
        let tli = ThermalShockGuard.computeTLI(samples: samples, now: now.addingTimeInterval(300))
        XCTAssertGreaterThan(tli, 0.5)
        XCTAssertEqual(ThermalShockGuard.recommendedIdle(tli: 0.1), 0)
        XCTAssertEqual(ThermalShockGuard.recommendedIdle(tli: 0.5), 45)
        XCTAssertEqual(ThermalShockGuard.recommendedIdle(tli: 1.2), 120)
    }

    func testSeverityFactorBounds() {
        let soft = AdaptiveMaintenance.severityFactor(
            oilReached80: true,
            distanceKm: 50,
            highRevShare: 0,
            idleShare: 0,
            thermalStressMin: 0,
            avgSpeedKmh: 60
        )
        XCTAssertEqual(soft, 1.0, accuracy: 0.01)
        let hard = AdaptiveMaintenance.severityFactor(
            oilReached80: false,
            distanceKm: 3,
            highRevShare: 1,
            idleShare: 1,
            thermalStressMin: 20,
            avgSpeedKmh: 10
        )
        XCTAssertLessThanOrEqual(hard, 2.4)
        XCTAssertGreaterThan(hard, 1.5)
    }

    func testMaintenanceNeverExtends() {
        let remaining = AdaptiveMaintenance.remainingKm(intervalKm: 10000, effectiveKm: 2000, actualKm: 5000)
        // effective would leave 8000, actual 5000 → min is 5000? Wait: byEffective=8000, byActual=5000 → min=5000
        // Actually adaptive shortens: if effectiveKm grows faster, byEffective is smaller
        let shortened = AdaptiveMaintenance.remainingKm(intervalKm: 10000, effectiveKm: 8000, actualKm: 5000)
        XCTAssertEqual(shortened, 2000, accuracy: 0.1)
        XCTAssertEqual(remaining, 5000, accuracy: 0.1)
    }

    func testTrimValidation() {
        XCTAssertFalse(FuelTrimMonitor.validateAlert(tripCount: 2, durationS: 2000, postRefuelS: 700))
        XCTAssertFalse(FuelTrimMonitor.validateAlert(tripCount: 3, durationS: 1000, postRefuelS: 700))
        XCTAssertFalse(FuelTrimMonitor.validateAlert(tripCount: 3, durationS: 2000, postRefuelS: 100))
        XCTAssertTrue(FuelTrimMonitor.validateAlert(tripCount: 3, durationS: 2000, postRefuelS: 700))
    }

    func testGearClustering() {
        // Simulate 6 gear ratios
        var samples: [Double] = []
        let centers = [120.0, 80, 55, 40, 30, 22]
        for c in centers {
            for _ in 0..<40 {
                samples.append(c + Double.random(in: -2...2))
            }
        }
        let clustered = GearCoach.clusterRatios(samples, k: 6)
        XCTAssertEqual(clustered.count, 6)
        XCTAssertGreaterThan(clustered.first!, clustered.last!)
    }

    func testOverheatImmatureThresholds() {
        let t = OverheatWatchdog.thresholds(
            baselineP95: nil,
            mature: false,
            ambientC: 20,
            load: 40,
            speed: 50,
            sensitivityOffset: 0
        )
        XCTAssertEqual(t.watch, 103, accuracy: 0.01)
        XCTAssertEqual(t.alarm, 108, accuracy: 0.01)
        XCTAssertEqual(t.critical, 116, accuracy: 0.01)
    }

    func testBatteryRegressionRequiresR2() {
        let points = (0..<15).map { (Double($0), 11.0 - Double($0) * 0.05) }
        let fit = BatteryGuardian.linearRegression(points)
        XCTAssertNotNil(fit)
        XCTAssertGreaterThan(fit!.r2, 0.35)
    }
}
