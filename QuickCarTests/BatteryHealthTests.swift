import XCTest
@testable import QuickCar

final class BatteryHealthTests: XCTestCase {
    func testClassifyThresholds() {
        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 10.8, ambientC: 20), .good)
        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 10.0, ambientC: 20), .fair)
        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 9.0, ambientC: 20), .weak)
    }

    func testColdCorrectionIsLenient() {
        // 10.2 without cold → fair; with ambient -5 adds 0.5 → good
        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 10.2, ambientC: -5), .good)
        XCTAssertEqual(BatteryHealthAnalyzer.classify(minVoltage: 10.2, ambientC: 20), .fair)
    }

    func testCrankDetectionOnRPMCross() {
        let now = Date()
        let samples: [(Date, Double)] = [
            (now.addingTimeInterval(-1.5), 12.4),
            (now.addingTimeInterval(-0.2), 9.8),
            (now.addingTimeInterval(0.2), 13.8),
            (now.addingTimeInterval(1.0), 14.1)
        ]
        let event = BatteryHealthAnalyzer.detectCrank(
            previousRPM: 0,
            currentRPM: 800,
            voltageSamples: samples,
            ambientC: 22,
            now: now
        )
        XCTAssertNotNil(event)
        XCTAssertEqual(event!.minVoltage, 9.8, accuracy: 0.01)
    }

    func testDecliningSlope() {
        let values = (0..<20).map { 11.0 - Double($0) * 0.03 }
        let slope = BatteryHealthAnalyzer.linearSlope(values)
        XCTAssertNotNil(slope)
        XCTAssertLessThan(slope!, -0.02)
        let history = values.map { CrankEvent(date: .now, minVoltage: $0, restingVoltage: 12.4, recoveryVoltage: 14.0, ambientC: 20) }
        let assessment = BatteryHealthAnalyzer.assess(history: history)
        XCTAssertEqual(assessment?.declining, true)
    }
}
