import XCTest
@testable import BMWCenter

/// Covers the "Mock/Simulator transport doesn't simulate degraded conditions"
/// gap documented in docs/obd-current.md §8 (PRD §149 Simulator Mode).
final class MockOBDTransportScenarioTests: XCTestCase {
    private func connect(_ transport: MockOBDTransport) async throws {
        var iterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        let adapters = await iterator.next()
        let id = try XCTUnwrap(adapters?.first?.id)
        try await transport.connect(peripheralID: id)
    }

    func testDefaultTransportHasNoArtificialDelay() async throws {
        let transport = MockOBDTransport()
        try await connect(transport)
        let start = Date()
        _ = try await transport.send("010C", timeout: 2)
        XCTAssertLessThan(Date().timeIntervalSince(start), 0.2)
    }

    func testResponseDelayIsAppliedBeforeReturning() async throws {
        let transport = MockOBDTransport(responseDelay: 0.2)
        try await connect(transport)
        let start = Date()
        _ = try await transport.send("010C", timeout: 2)
        XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(start), 0.2)
    }

    func testResponseDelayExceedingTimeoutThrowsTimeout() async throws {
        let transport = MockOBDTransport(responseDelay: 0.3)
        try await connect(transport)
        do {
            _ = try await transport.send("010C", timeout: 0.1)
            XCTFail("expected timeout error")
        } catch let error as OBDError {
            XCTAssertEqual(error, .timeout)
        }
    }

    func testDisconnectAfterSimulatesMidSessionDrop() async throws {
        let transport = MockOBDTransport(disconnectAfter: 0.1)
        try await connect(transport)
        // Immediately after connect, still within the window.
        _ = try? await transport.send("010C", timeout: 1)
        try? await Task.sleep(nanoseconds: 150_000_000)
        do {
            _ = try await transport.send("010C", timeout: 1)
            XCTFail("expected disconnected error after disconnectAfter elapses")
        } catch let error as OBDError {
            XCTAssertEqual(error, .disconnected)
        }
    }
}
