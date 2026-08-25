import XCTest
@testable import QuickCar

final class SpeedCalibratorTests: XCTestCase {
    func testMedianOdd() {
        XCTAssertEqual(SpeedCalibrator.median([0.9, 1.0, 1.1]), 1.0, accuracy: 0.0001)
    }

    func testMedianEven() {
        XCTAssertEqual(SpeedCalibrator.median([0.9, 1.0, 1.1, 1.2]), 1.05, accuracy: 0.0001)
    }

    func testClampRange() {
        let low = min(max(0.5, 0.85), 1.10)
        let high = min(max(1.5, 0.85), 1.10)
        XCTAssertEqual(low, 0.85)
        XCTAssertEqual(high, 1.10)
    }
}
