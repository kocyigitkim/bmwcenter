import XCTest
import CoreLocation
@testable import QuickCar

@MainActor
final class ExportTests: XCTestCase {
    func testCSVHeaderExact() {
        let expected = "id,started_at,ended_at,distance_km,duration_s,moving_s,idle_s,fuel_l,idle_fuel_l,avg_l_100km,avg_speed_kmh,max_speed_kmh,max_rpm,score,category,start_place,end_place,data_source"
        XCTAssertEqual(CSVExporter.tripHeader, expected)
    }

    func testCSVEscapesQuotes() {
        let trip = Trip()
        trip.startPlaceName = "Foo \"Bar\" Station"
        trip.distanceKm = 12.5
        trip.durationS = 600
        trip.avgL100 = 8.25
        guard let url = CSVExporter.exportTrips([trip]) else {
            return XCTFail("export failed")
        }
        let text = try! String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(text.contains(CSVExporter.tripHeader))
        XCTAssertTrue(text.contains("\"Foo \"\"Bar\"\" Station\""))
        XCTAssertTrue(text.contains("12.500000"))
        XCTAssertTrue(text.contains("8.250000"))
    }

    func testGPXContainsTrackPoints() {
        let trip = Trip()
        let coords = [
            CLLocationCoordinate2D(latitude: 41.01, longitude: 28.97),
            CLLocationCoordinate2D(latitude: 41.02, longitude: 28.98)
        ]
        trip.routeData = RouteSimplifier.encode(coords)
        guard let url = GPXExporter.export(trip: trip) else {
            return XCTFail("gpx failed")
        }
        let text = try! String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(text.contains("version=\"1.1\""))
        XCTAssertTrue(text.contains("<trkpt lat=\"41.01\""))
        XCTAssertTrue(text.contains("<trkpt lat=\"41.02\""))
    }

    func testPDFContainsTripSummary() {
        let trip = Trip()
        trip.distanceKm = 42
        trip.fuelUsedL = 3.1
        trip.avgL100 = 7.4
        trip.scoreTotal = 91
        let settings = AppSettings(defaults: UserDefaults(suiteName: UUID().uuidString)!)
        settings.pricePerLiter = 50
        guard let url = PDFReportBuilder.build(trips: [trip], settings: settings, vehicleName: "Test Car") else {
            return XCTFail("pdf failed")
        }
        let data = try! Data(contentsOf: url)
        XCTAssertGreaterThan(data.count, 200)
        let ascii = String(decoding: data, as: UTF8.self)
        XCTAssertTrue(ascii.contains("PDF") || data.starts(with: [0x25, 0x50, 0x44, 0x46]))
    }
}
