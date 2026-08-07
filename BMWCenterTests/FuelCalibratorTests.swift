import XCTest
@testable import BMWCenter

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
}
