import XCTest
@testable import BMWCenter

final class ReplayTransportTests: XCTestCase {
    private func makeConnectedTransport(frames: [ReplayFrame]) async throws -> ReplayTransport {
        let fixture = ReplayFixture(name: "Test Fixture", frames: frames)
        let transport = ReplayTransport(fixture: fixture)
        var scanIterator = transport.discoveredAdapters.makeAsyncIterator()
        await transport.startScan()
        let adapters = await scanIterator.next()
        let id = try XCTUnwrap(adapters?.first?.id)
        try await transport.connect(peripheralID: id)
        return transport
    }

    func testReplaysRecordedResponseForExactCommand() async throws {
        let transport = try await makeConnectedTransport(frames: [
            ReplayFrame(request: "010C", response: "41 0C 1A F8")
        ])
        let response = try await transport.send("010C", timeout: 1)
        XCTAssertEqual(response, "41 0C 1A F8")
    }

    func testCyclesThroughMultipleRecordedResponsesThenRepeatsLast() async throws {
        let transport = try await makeConnectedTransport(frames: [
            ReplayFrame(request: "0105", response: "41 05 28"),
            ReplayFrame(request: "0105", response: "41 05 3C"),
            ReplayFrame(request: "0105", response: "41 05 50")
        ])
        let first = try await transport.send("0105", timeout: 1)
        let second = try await transport.send("0105", timeout: 1)
        let third = try await transport.send("0105", timeout: 1)
        let fourth = try await transport.send("0105", timeout: 1)
        XCTAssertEqual(first, "41 05 28")
        XCTAssertEqual(second, "41 05 3C")
        XCTAssertEqual(third, "41 05 50")
        XCTAssertEqual(fourth, "41 05 50", "should keep repeating the last recorded value once exhausted")
    }

    func testUnrecordedModePIDReturnsNoData() async throws {
        let transport = try await makeConnectedTransport(frames: [
            ReplayFrame(request: "010C", response: "41 0C 1A F8")
        ])
        let response = try await transport.send("015C", timeout: 1)
        XCTAssertEqual(response, "NO DATA")
    }

    func testUnrecordedATCommandReturnsOK() async throws {
        let transport = try await makeConnectedTransport(frames: [])
        let response = try await transport.send("ATL0", timeout: 1)
        XCTAssertEqual(response, "OK")
    }

    func testCommandMatchingIsCaseAndWhitespaceInsensitive() async throws {
        let transport = try await makeConnectedTransport(frames: [
            ReplayFrame(request: "010c", response: "41 0C 1A F8")
        ])
        let response = try await transport.send("  010C  \n", timeout: 1)
        XCTAssertEqual(response, "41 0C 1A F8")
    }

    func testSendBeforeConnectThrowsDisconnected() async {
        let fixture = ReplayFixture(name: "Test Fixture", frames: [])
        let transport = ReplayTransport(fixture: fixture)
        do {
            _ = try await transport.send("010C", timeout: 1)
            XCTFail("expected disconnected error")
        } catch let error as OBDError {
            XCTAssertEqual(error, .disconnected)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }

    func testConnectWithWrongPeripheralIDThrowsNotFound() async {
        let fixture = ReplayFixture(name: "Test Fixture", frames: [])
        let transport = ReplayTransport(fixture: fixture)
        do {
            try await transport.connect(peripheralID: UUID())
            XCTFail("expected notFound error")
        } catch let error as OBDError {
            XCTAssertEqual(error, .notFound)
        } catch {
            XCTFail("unexpected error type: \(error)")
        }
    }
}
