import XCTest
@testable import BMWCenter

final class TransportMetricsTests: XCTestCase {
    func testAverageLatencyAccumulates() async {
        let recorder = TransportMetricsRecorder()
        await recorder.recordSuccess(latencyMs: 100)
        await recorder.recordSuccess(latencyMs: 200)
        let metrics = await recorder.metrics
        XCTAssertEqual(metrics.commandCount, 2)
        XCTAssertEqual(metrics.averageLatencyMs, 150, accuracy: 0.001)
        XCTAssertEqual(metrics.lastLatencyMs, 200)
        XCTAssertEqual(metrics.timeoutCount, 0)
        XCTAssertEqual(metrics.timeoutRate, 0)
    }

    func testTimeoutRateComputedFromCommandCount() async {
        let recorder = TransportMetricsRecorder()
        await recorder.recordSuccess(latencyMs: 50)
        await recorder.recordTimeout()
        await recorder.recordTimeout()
        let metrics = await recorder.metrics
        XCTAssertEqual(metrics.commandCount, 3)
        XCTAssertEqual(metrics.timeoutCount, 2)
        XCTAssertEqual(metrics.timeoutRate, 2.0 / 3.0, accuracy: 0.001)
    }

    func testTimeoutRateIsZeroWithNoCommands() async {
        let recorder = TransportMetricsRecorder()
        let metrics = await recorder.metrics
        XCTAssertEqual(metrics.timeoutRate, 0)
        XCTAssertEqual(metrics.commandCount, 0)
    }

    func testResetClearsAccumulatedStats() async {
        let recorder = TransportMetricsRecorder()
        await recorder.recordSuccess(latencyMs: 100)
        await recorder.recordTimeout()
        await recorder.reset()
        let metrics = await recorder.metrics
        XCTAssertEqual(metrics.commandCount, 0)
        XCTAssertEqual(metrics.timeoutCount, 0)
        XCTAssertEqual(metrics.averageLatencyMs, 0)
        XCTAssertNil(metrics.lastLatencyMs)
    }
}
