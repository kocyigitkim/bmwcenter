import XCTest
import SwiftData
@testable import QuickCar

@MainActor
final class FuelCalibratorTests: XCTestCase {
    func testAcceptanceCriteriaRejectLowCalculated() {
        let measured = 40.0
        let calculated = 10.0
        let distance = 200.0
        let raw = measured / calculated
        XCTAssertFalse(calculated > 15 && distance > 150 && raw >= 0.6 && raw <= 1.6)
    }

    func testAcceptanceCriteriaAcceptValid() {
        let measured = 40.0
        let calculated = 36.0
        let distance = 200.0
        let raw = measured / calculated
        XCTAssertTrue(calculated > 15 && distance > 150 && raw >= 0.6 && raw <= 1.6)
        XCTAssertEqual(raw, 40.0 / 36.0, accuracy: 0.001)
    }

    func testEMAAndClamp() {
        var factor = 1.0
        let raw = 1.2
        factor = factor * (1 - 0.35) + raw * 0.35
        factor = min(max(factor, 0.7), 1.4)
        XCTAssertEqual(factor, 1.0 * 0.65 + 1.2 * 0.35, accuracy: 0.0001)

        factor = 2.0
        factor = min(max(factor, 0.7), 1.4)
        XCTAssertEqual(factor, 1.4)

        factor = 0.5
        factor = min(max(factor, 0.7), 1.4)
        XCTAssertEqual(factor, 0.7)
    }

    func testRawFactorOutOfRangeRejected() {
        let rawLow = 0.5
        let rawHigh = 1.7
        XCTAssertFalse((0.6...1.6).contains(rawLow))
        XCTAssertFalse((0.6...1.6).contains(rawHigh))
    }

    func testEvaluateAcceptsFullTankPairAndReset() throws {
        let schema = Schema([Trip.self, RefuelEntry.self, CalibrationSample.self, FuelPricePoint.self])
        let container = try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = ModelContext(container)
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        let fuelRepo = FuelRepository(modelContext: context)
        let tripRepo = TripRepository(modelContext: context, settings: settings)
        let calibrator = FuelCalibrator(fuelRepository: fuelRepo, tripRepository: tripRepo, settings: settings)

        let t0 = Date(timeIntervalSince1970: 1_600_000_000)
        fuelRepo.addRefuel(RefuelEntry(date: t0, liters: 40, pricePerLiter: 40, odometerKm: 1000, isFullTank: true))
        let trip = Trip(startedAt: t0.addingTimeInterval(3_600))
        trip.distanceKm = 200
        trip.fuelUsedL = 36
        trip.durationS = 7_200
        context.insert(trip)
        try context.save()
        fuelRepo.addRefuel(RefuelEntry(date: t0.addingTimeInterval(86_400), liters: 40, pricePerLiter: 40, odometerKm: 1200, isFullTank: true))

        calibrator.evaluateLatestFullTankPair()
        let samples = fuelRepo.calibrationSamples()
        XCTAssertEqual(samples.count, 1)
        XCTAssertTrue(samples.first?.accepted ?? false)
        XCTAssertEqual(samples.first?.rawFactor ?? 0, 40.0 / 36.0, accuracy: 0.001)
        XCTAssertEqual(settings.fuelCalibrationFactor, 1.0, accuracy: 0.001)

        calibrator.reset()
        XCTAssertEqual(settings.fuelCalibrationFactor, 1.0)
        XCTAssertTrue(fuelRepo.calibrationSamples().isEmpty)
    }

    func testEvaluateRejectsShortDistance() throws {
        let schema = Schema([Trip.self, RefuelEntry.self, CalibrationSample.self, FuelPricePoint.self])
        let container = try ModelContainer(for: schema, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        let context = ModelContext(container)
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        let fuelRepo = FuelRepository(modelContext: context)
        let calibrator = FuelCalibrator(
            fuelRepository: fuelRepo,
            tripRepository: TripRepository(modelContext: context, settings: settings),
            settings: settings
        )
        let t0 = Date(timeIntervalSince1970: 1_600_000_000)
        fuelRepo.addRefuel(RefuelEntry(date: t0, liters: 40, pricePerLiter: 40, isFullTank: true))
        let trip = Trip(startedAt: t0.addingTimeInterval(100))
        trip.distanceKm = 20
        trip.fuelUsedL = 10
        context.insert(trip)
        try context.save()
        fuelRepo.addRefuel(RefuelEntry(date: t0.addingTimeInterval(3_600), liters: 40, pricePerLiter: 40, isFullTank: true))
        calibrator.evaluateLatestFullTankPair()
        XCTAssertEqual(fuelRepo.calibrationSamples().first?.accepted, false)
    }
}
