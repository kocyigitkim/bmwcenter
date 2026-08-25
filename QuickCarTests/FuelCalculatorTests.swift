import XCTest
@testable import QuickCar

final class FuelCalculatorTests: XCTestCase {
    func testFuelRateFrom5E() {
        var snap = VehicleSnapshot()
        snap.engineFuelRateLh = 3.5
        let rate = FuelCalculator.fuelRateLh(snapshot: snap, fuelType: .gasoline, displacementL: 2, volumetricEfficiency: 0.85)
        XCTAssertEqual(rate, 3.5)
    }

    func testFuelRateFromMAF() {
        var snap = VehicleSnapshot()
        snap.mafGs = 10
        let rate = FuelCalculator.fuelRateLh(snapshot: snap, fuelType: .gasoline, displacementL: 2, volumetricEfficiency: 0.85)
        XCTAssertEqual(rate!, 10 * 0.32880, accuracy: 0.0001)
    }

    func testFuelRateSpeedDensity() {
        var snap = VehicleSnapshot()
        snap.mapKpa = 100
        snap.intakeAirC = 20
        snap.rpm = 2000
        let rate = FuelCalculator.fuelRateLh(snapshot: snap, fuelType: .gasoline, displacementL: 2, volumetricEfficiency: 0.85)
        XCTAssertNotNil(rate)
        XCTAssertGreaterThan(rate!, 0)
    }

    func testFuelRateNil() {
        let rate = FuelCalculator.fuelRateLh(snapshot: VehicleSnapshot(), fuelType: .gasoline, displacementL: 2, volumetricEfficiency: 0.85)
        XCTAssertNil(rate)
    }

    func testInstantL100() {
        let r = FuelCalculator.instantL100(fuelRateLh: 8, speedKmh: 100)
        XCTAssertEqual(r.l100!, 8, accuracy: 0.01)
        XCTAssertNil(r.idleLh)
    }

    func testInstantIdle() {
        let r = FuelCalculator.instantL100(fuelRateLh: 1.2, speedKmh: 0)
        XCTAssertNil(r.l100)
        XCTAssertEqual(r.idleLh, 1.2)
    }

    func testTrapezoidIntegration() {
        var state = FuelIntegrationState()
        let t0 = Date(timeIntervalSince1970: 0)
        // 3600 samples of 1s at 100 km/h and 2 L/h → 2 L, 100 km
        state.integrate(FuelSample(t: t0, speedKmh: 100, fuelRateLh: 2))
        for i in 1...3600 {
            state.integrate(FuelSample(t: t0.addingTimeInterval(Double(i)), speedKmh: 100, fuelRateLh: 2))
        }
        XCTAssertEqual(state.fuelUsedL, 2, accuracy: 0.05)
        XCTAssertEqual(state.distanceKm, 100, accuracy: 0.5)
        XCTAssertEqual(state.avgL100!, 2, accuracy: 0.1)
    }

    func testInvalidAvgRejected() {
        XCTAssertFalse(FuelCalculator.isValidAvgL100(0.1))
        XCTAssertFalse(FuelCalculator.isValidAvgL100(80))
        XCTAssertTrue(FuelCalculator.isValidAvgL100(7.5))
    }

    func testDieselCoefficient() {
        XCTAssertEqual(FuelType.diesel.mafToLh, 0.29840, accuracy: 0.00001)
    }

    func testCalibrationFactorApplied() {
        var snap = VehicleSnapshot()
        snap.mafGs = 10
        let rate = FuelCalculator.fuelRateLh(
            snapshot: snap,
            fuelType: .gasoline,
            displacementL: 2,
            volumetricEfficiency: 0.85,
            calibrationFactor: 1.1
        )
        XCTAssertEqual(rate!, 10 * 0.32880 * 1.1, accuracy: 0.0001)
    }

    func testEstimatedRangeAfterFill() {
        let tank = 60.0
        let before = FuelCalculator.estimatedRangeKm(fuelLevelPct: 20, tankCapacityL: tank, avgL100: 8)
        XCTAssertEqual(before ?? -1, 150, accuracy: 0.1)
        let after = FuelCalculator.estimatedRangeKm(fuelLevelPct: 100, tankCapacityL: tank, avgL100: 8)
        XCTAssertEqual(after ?? -1, 750, accuracy: 0.1)
        XCTAssertNil(FuelCalculator.estimatedRangeKm(fuelLevelPct: nil, tankCapacityL: tank, avgL100: 8))
    }

    func testCostAndMpgFromIntegration() {
        XCTAssertEqual(FuelCalculator.cost(fuelUsedL: 10, pricePerLiter: 45), 450, accuracy: 0.01)
        var state = FuelIntegrationState()
        let t0 = Date(timeIntervalSince1970: 0)
        state.integrate(FuelSample(t: t0, speedKmh: 100, fuelRateLh: 8))
        for i in 1...40 {
            state.integrate(FuelSample(t: t0.addingTimeInterval(Double(i)), speedKmh: 100, fuelRateLh: 8))
        }
        XCTAssertEqual(state.avgL100 ?? 0, 8, accuracy: 0.2)
        XCTAssertEqual(state.kmPerL ?? 0, 12.5, accuracy: 0.3)
        XCTAssertEqual(state.mpgUS ?? 0, 235.215 / 8, accuracy: 0.5)
        XCTAssertEqual(state.mpgUK ?? 0, 282.481 / 8, accuracy: 0.5)
    }

    func testIdleVsMovingSwitch() {
        let idle = FuelCalculator.instantL100(fuelRateLh: 1.0, speedKmh: 2)
        XCTAssertNil(idle.l100)
        XCTAssertEqual(idle.idleLh, 1.0)
        let moving = FuelCalculator.instantL100(fuelRateLh: 8, speedKmh: 80)
        XCTAssertEqual(moving.l100 ?? -1, 10, accuracy: 0.01)
        XCTAssertNil(moving.idleLh)
    }
}
