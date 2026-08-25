import XCTest
@testable import QuickCar

final class BaselineLearnerTests: XCTestCase {
    func testWelfordMeanAndPercentiles() {
        var count = 0
        var mean = 0.0
        var m2 = 0.0
        var bins = Array(repeating: 0, count: BaselineLearner.histogramBins)
        let values = (0..<200).map { _ in Double.random(in: 88...96) }
        for v in values {
            BaselineLearner.updateOnline(
                count: &count,
                mean: &mean,
                m2: &m2,
                bins: &bins,
                value: v,
                range: 70...130
            )
        }
        XCTAssertEqual(count, 200)
        XCTAssertEqual(mean, values.reduce(0, +) / Double(values.count), accuracy: 0.5)
        let (p50, p95) = BaselineLearner.percentiles(bins: bins, range: 70...130)
        XCTAssertGreaterThan(p50, 85)
        XCTAssertLessThan(p50, 100)
        XCTAssertGreaterThanOrEqual(p95, p50)
    }

    func testAmbientBuckets() {
        XCTAssertEqual(CareBucket.ambient(-5), "ambient:<0")
        XCTAssertEqual(CareBucket.ambient(15), "ambient:10-20")
        XCTAssertEqual(CareBucket.ambient(35), "ambient:>30")
    }
}
