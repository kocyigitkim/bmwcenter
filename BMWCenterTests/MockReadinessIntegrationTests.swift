import XCTest
@testable import BMWCenter

/// Verifies MockOBDTransport's "0101" response decodes correctly through the
/// same OBDFrameParser.parse + ReadinessParser.parse pipeline OBDService uses
/// (OBDService.readReadiness), without needing full OBDService/BLE setup.
final class MockReadinessIntegrationTests: XCTestCase {
    func testMockTransportReadinessResponseDecodes() async throws {
        let transport = MockOBDTransport()
        var iterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        let adapters = await iterator.next()
        let id = try XCTUnwrap(adapters?.first?.id)
        try await transport.connect(peripheralID: id)

        let response = try await transport.send("0101", timeout: 2)
        let parsed = OBDFrameParser.parse(
            response: response, expectedPID: 0x01, byteCount: 4, sentCommand: "0101"
        )
        guard case .value(let bytes) = parsed else {
            XCTFail("expected a value result, got \(parsed)")
            return
        }
        let status = try XCTUnwrap(ReadinessParser.parse(bytes: bytes))
        XCTAssertEqual(status.milOn, false)
        XCTAssertEqual(status.dtcCount, 1)
        XCTAssertTrue(status.isFullyReady)
    }
}
