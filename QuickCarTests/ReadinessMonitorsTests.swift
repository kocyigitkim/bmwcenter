import XCTest
@testable import QuickCar

final class ReadinessMonitorsTests: XCTestCase {
    func testWrongByteCountReturnsNil() {
        XCTAssertNil(ReadinessParser.parse(bytes: [0x00, 0x00, 0x00]))
    }

    func testMILOnAndDTCCount() {
        // A = 0x82 = MIL on (bit7), 2 DTCs (0000010)
        let status = ReadinessParser.parse(bytes: [0x82, 0x00, 0x00, 0x00])
        XCTAssertEqual(status?.milOn, true)
        XCTAssertEqual(status?.dtcCount, 2)
    }

    func testMILOffAndZeroDTCs() {
        let status = ReadinessParser.parse(bytes: [0x00, 0x00, 0x00, 0x00])
        XCTAssertEqual(status?.milOn, false)
        XCTAssertEqual(status?.dtcCount, 0)
    }

    func testAllSparkIgnitionMonitorsSupportedAndReady() {
        // B = 0x07: misfire/fuelSystem/components supported (bits 0-2), spark
        // ignition (bit3=0), all three ready (bits 4-6=0).
        // C = 0xFF: every non-continuous monitor supported.
        // D = 0x00: every supported monitor ready (bit=0 means complete).
        let status = ReadinessParser.parse(bytes: [0x00, 0x07, 0xFF, 0x00])
        XCTAssertNotNil(status)
        XCTAssertEqual(status?.monitors.count, 11)
        XCTAssertTrue(status?.isFullyReady == true)
        for monitor in status?.monitors ?? [] {
            XCTAssertTrue(monitor.isSupported, "\(monitor.kind) should be supported")
            XCTAssertTrue(monitor.isReady, "\(monitor.kind) should be ready")
        }
    }

    func testUnsupportedMonitorIsExcludedFromFullyReadyCheck() {
        // C = 0x00: no non-continuous monitors supported.
        // B = 0x07: continuous monitors supported and ready.
        let status = ReadinessParser.parse(bytes: [0x00, 0x07, 0x00, 0x00])
        XCTAssertEqual(status?.supportedMonitors.count, 3, "only the 3 continuous monitors are supported")
        XCTAssertTrue(status?.isFullyReady == true, "unsupported monitors don't block full-ready")
    }

    func testNotReadyMonitorIsReflected() {
        // B: misfire supported (bit0), not ready (bit4 set).
        let status = ReadinessParser.parse(bytes: [0x00, 0x11, 0x00, 0x00])
        let misfire = status?.monitors.first { $0.kind == .misfire }
        XCTAssertEqual(misfire?.isSupported, true)
        XCTAssertEqual(misfire?.isReady, false)
        XCTAssertFalse(status?.isFullyReady == true)
    }

    func testCompressionIgnitionOnlyDecodesContinuousMonitors() {
        // B bit3 set = compression ignition. C/D non-continuous bits are not
        // decoded (documented gap) — only the 3 continuous monitors appear.
        let status = ReadinessParser.parse(bytes: [0x00, 0x0F, 0xFF, 0xFF])
        XCTAssertEqual(status?.monitors.count, 3)
    }
}
