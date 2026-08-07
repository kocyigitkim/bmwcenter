import XCTest
@testable import BMWCenter

/// Covers PRD §35/§186: Mode 04 (clear DTC) must require explicit confirmation
/// at the call site, not just rely on a UI dialog existing somewhere upstream.
@MainActor
final class DiagnosticSafetyTests: XCTestCase {
    func testClearDTCsWithoutConfirmationThrows() async {
        let transport = MockOBDTransport()
        try? await transport.connect(peripheralID: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!)
        let service = DTCService(transportProvider: { transport })

        do {
            try await service.clearDTCs(confirmed: false)
            XCTFail("expected DiagnosticConfirmationRequired")
        } catch let error as DiagnosticConfirmationRequired {
            XCTAssertEqual(error, DiagnosticConfirmationRequired(operation: "clearDTCs"))
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    func testClearDTCsWithConfirmationSendsMode04() async throws {
        let fixture = ReplayFixture(name: "clear", frames: [ReplayFrame(request: "04", response: "44")])
        let transport = ReplayTransport(fixture: fixture)
        var iterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        let adapters = await iterator.next()
        let id = try XCTUnwrap(adapters?.first?.id)
        try await transport.connect(peripheralID: id)

        let service = DTCService(transportProvider: { transport })
        try await service.clearDTCs(confirmed: true)
        // No throw = the send happened; ReplayTransport would return "NO DATA"
        // for an unrecorded command, but here we recorded exactly "04" -> "44".
    }
}
