import XCTest
@testable import QuickCar

final class WidgetDataStoreTests: XCTestCase {
    func testWriteReadRoundTrip() {
        let stamp = Date(timeIntervalSince1970: 1_700_000_000)
        let snapshot = WidgetSnapshot(
            fuelLevelPct: 62,
            estimatedRangeKm: 410,
            lastTripDistanceKm: 18.4,
            lastTripDurationS: 1_540,
            lastTripL100: 7.2,
            lastTripScore: 88,
            updatedAt: stamp
        )
        WidgetDataStore.write(snapshot)
        let loaded = WidgetDataStore.read()
        XCTAssertEqual(loaded?.fuelLevelPct, 62)
        XCTAssertEqual(loaded?.estimatedRangeKm, 410)
        XCTAssertEqual(loaded?.lastTripDistanceKm, 18.4)
        XCTAssertEqual(loaded?.lastTripDurationS, 1_540)
        XCTAssertEqual(loaded?.lastTripL100, 7.2)
        XCTAssertEqual(loaded?.lastTripScore, 88)
        XCTAssertEqual(loaded?.updatedAt, stamp)
        XCTAssertEqual(WidgetDataStore.load()?.fuelLevelPct, 62)
    }
}
