import XCTest
import CoreLocation
@testable import QuickCar

final class CoreUtilitiesTests: XCTestCase {
    func testRingBufferWrapsAndPreservesOrder() {
        var buffer = RingBuffer<Int>(capacity: 3)
        buffer.append(1)
        buffer.append(2)
        buffer.append(3)
        buffer.append(4)
        XCTAssertEqual(buffer.count, 3)
        XCTAssertEqual(buffer.elements(), [2, 3, 4])
        buffer.removeAll()
        XCTAssertEqual(buffer.elements(), [])
    }

    func testRouteEncodeDecodeRoundTrip() {
        let points = [
            CLLocationCoordinate2D(latitude: 41.0082, longitude: 28.9784),
            CLLocationCoordinate2D(latitude: 41.0420, longitude: 29.0080)
        ]
        let data = RouteSimplifier.encode(points)
        let decoded = RouteSimplifier.decode(data)
        XCTAssertEqual(decoded.count, 2)
        XCTAssertEqual(decoded[0].latitude, 41.0082, accuracy: 0.0001)
        XCTAssertEqual(decoded[1].longitude, 29.0080, accuracy: 0.0001)
    }

    func testRouteSimplifyCollinearKeepsEnds() {
        let points = (0..<20).map {
            CLLocationCoordinate2D(latitude: 41.0 + Double($0) * 0.00001, longitude: 29.0)
        }
        let simplified = RouteSimplifier.simplify(points, epsilonMeters: 12, maxPoints: 500)
        XCTAssertLessThan(simplified.count, points.count)
        XCTAssertEqual(simplified.first?.latitude ?? 0, points.first!.latitude, accuracy: 0.00001)
        XCTAssertEqual(simplified.last?.latitude ?? 0, points.last!.latitude, accuracy: 0.00001)
    }

    func testBoostPrefersMode22ThenMAPMinusBaro() {
        var snap = VehicleSnapshot()
        snap.mapKpa = 180
        snap.baroKpa = 101
        XCTAssertEqual(snap.boostKpa ?? -1, 79, accuracy: 0.01)
        XCTAssertEqual(snap.boostBar ?? 0, 0.79, accuracy: 0.001)

        snap.boostActualKpa = 220
        XCTAssertEqual(snap.boostKpa ?? -1, 119, accuracy: 0.01)
        XCTAssertFalse(snap.isEngineRunning)

        snap.rpm = 800
        XCTAssertTrue(snap.isEngineRunning)
        snap.rpm = 200
        XCTAssertFalse(snap.isEngineRunning)
    }

    func testDataFreshnessStates() {
        XCTAssertEqual(DataFreshness.from(timestamp: nil, connected: true), .disconnected)
        XCTAssertEqual(DataFreshness.from(timestamp: Date(), connected: false), .disconnected)
        XCTAssertEqual(DataFreshness.from(timestamp: Date(), connected: true, failed: true), .error)
        XCTAssertEqual(DataFreshness.from(timestamp: Date(), connected: true, supported: false), .unavailable)
        XCTAssertEqual(DataFreshness.from(timestamp: Date(), connected: true), .live)
        let stale = Date().addingTimeInterval(-3)
        XCTAssertEqual(DataFreshness.from(timestamp: stale, connected: true), .stale)
    }

    func testMaintenanceTemplatesCoverOilInterval() {
        let items = MaintenanceTemplates.defaults()
        XCTAssertGreaterThanOrEqual(items.count, 8)
        let oil = items.first { $0.titleKey == "maintenance.oil" }
        XCTAssertEqual(oil?.intervalKm, 10_000)
        XCTAssertEqual(oil?.intervalMonths, 12)
    }

    func testDrivingSummaryAggregatesTrips() {
        let a = Trip()
        a.distanceKm = 40
        a.durationS = 2_400
        a.fuelUsedL = 3.2
        a.avgL100 = 8.0
        a.scoreTotal = 90
        a.maxSpeedKmh = 110
        let b = Trip()
        b.distanceKm = 60
        b.durationS = 2_800
        b.fuelUsedL = 4.8
        b.avgL100 = 8.0
        b.scoreTotal = 80
        b.maxSpeedKmh = 130
        let summary = DrivingSummary(trips: [a, b], pricePerLiter: 50)
        XCTAssertEqual(summary.tripCount, 2)
        XCTAssertEqual(summary.distanceKm, 100, accuracy: 0.01)
        XCTAssertEqual(summary.fuelUsedL, 8.0, accuracy: 0.01)
        XCTAssertEqual(summary.avgL100, 8.0, accuracy: 0.01)
        XCTAssertEqual(summary.estimatedCost, 400, accuracy: 0.01)
        XCTAssertEqual(summary.avgScore ?? 0, 85, accuracy: 0.01)
        XCTAssertEqual(summary.maxSpeedKmh, 130, accuracy: 0.01)
    }

    func testFuelTypeCoefficients() {
        XCTAssertEqual(FuelType.gasoline.afr, 14.7, accuracy: 0.01)
        XCTAssertEqual(FuelType.gasoline.mafToLh, 0.32880, accuracy: 0.00001)
        XCTAssertEqual(FuelType.lpg.mafToLh, 0.42735, accuracy: 0.00001)
        XCTAssertEqual(ELM327Commands.mode01(0x0C), "010C")
        XCTAssertEqual(ELM327Commands.readDTCs, "03")
        XCTAssertEqual(ELM327Commands.clearDTCs, "04")
    }

    func testImperialDistanceFormatter() {
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.unitSystem = .imperial
        let text = Formatters.distance(100, settings: settings)
        XCTAssertTrue(text.contains("62"), text)
    }
}
