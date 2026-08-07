import XCTest
@testable import BMWCenter

final class AdapterCapabilitiesTests: XCTestCase {
    func testEmptyBitmaskYieldsNoCapabilities() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [])
        XCTAssertTrue(caps.isEmpty, "empty input means unknown, not a partial capability set")
    }

    func testRPMAndSpeedYieldLiveData() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x0C, 0x0D])
        XCTAssertTrue(caps.contains(.genericOBD))
        XCTAssertTrue(caps.contains(.liveData))
        XCTAssertFalse(caps.contains(.fuelSystem))
        XCTAssertFalse(caps.contains(.airflow))
        XCTAssertFalse(caps.contains(.electrical))
    }

    func testOnlySpeedWithoutRPMDoesNotYieldLiveData() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x0D])
        XCTAssertTrue(caps.contains(.genericOBD))
        XCTAssertFalse(caps.contains(.liveData), "liveData requires both RPM and speed")
    }

    func testFuelTrimPIDsYieldFuelSystem() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x06])
        XCTAssertTrue(caps.contains(.fuelSystem))
    }

    func testAirflowPIDsYieldAirflow() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x10])
        XCTAssertTrue(caps.contains(.airflow))
    }

    func testVoltagePIDYieldsElectrical() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x42])
        XCTAssertTrue(caps.contains(.electrical))
    }

    func testFullBitmaskYieldsAllGroups() {
        let caps = AdapterCapabilities.detect(supportedPIDs: [0x0C, 0x0D, 0x04, 0x10, 0x42])
        XCTAssertEqual(
            caps,
            [.genericOBD, .liveData, .fuelSystem, .airflow, .electrical]
        )
    }
}
