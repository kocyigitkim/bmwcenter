import XCTest
@testable import BMWCenter

/// Covers the "adapter echo not disabled" gap documented in docs/obd-current.md §4:
/// if ATE0 didn't take effect, the adapter echoes the sent command back before
/// its actual data line.
final class OBDFrameParserEchoTests: XCTestCase {
    func testEchoedCommandLineIsIgnoredWhenSentCommandProvided() {
        let response = "010C\r41 0C 1A F8\r>"
        let result = OBDFrameParser.parse(
            response: response, expectedPID: 0x0C, byteCount: 2, sentCommand: "010C"
        )
        XCTAssertEqual(result, .value([0x1A, 0xF8]))
    }

    func testEchoedCommandLineIsCaseAndWhitespaceInsensitive() {
        let response = "  010c  \r41 0C 1A F8\r>"
        let result = OBDFrameParser.parse(
            response: response, expectedPID: 0x0C, byteCount: 2, sentCommand: "010C"
        )
        XCTAssertEqual(result, .value([0x1A, 0xF8]))
    }

    func testParsingStillWorksWithoutSentCommand() {
        // Backward compatibility: existing call sites that don't pass sentCommand
        // are unaffected — echo-free responses still parse normally.
        let response = "41 0C 1A F8\r>"
        let result = OBDFrameParser.parse(response: response, expectedPID: 0x0C, byteCount: 2)
        XCTAssertEqual(result, .value([0x1A, 0xF8]))
    }

    func testUnrelatedEchoLineDoesNotAffectParsing() {
        // A stale echo of a *different* command than the one just sent should
        // not be filtered — only the exact match is stripped.
        let response = "0105\r41 0C 1A F8\r>"
        let result = OBDFrameParser.parse(
            response: response, expectedPID: 0x0C, byteCount: 2, sentCommand: "010C"
        )
        XCTAssertEqual(result, .value([0x1A, 0xF8]))
    }
}
