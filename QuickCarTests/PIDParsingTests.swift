import XCTest
@testable import QuickCar

final class PIDParsingTests: XCTestCase {
    func testRPMSpaced() {
        let result = OBDFrameParser.parse(response: "41 0C 1A F8", expectedPID: 0x0C, byteCount: 2)
        guard case .value(let bytes) = result else { return XCTFail("expected value") }
        let rpm = OBDPIDCatalog.rpm.parse(bytes)
        XCTAssertEqual(rpm, 1726)
    }

    func testRPMNoSpaces() {
        let result = OBDFrameParser.parse(response: "410C1AF8", expectedPID: 0x0C, byteCount: 2)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.rpm.parse(bytes), 1726)
    }

    func testHeaderFrame() {
        let result = OBDFrameParser.parse(response: "7E8 06 41 0C 1A F8 00", expectedPID: 0x0C, byteCount: 2)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.rpm.parse(bytes), 1726)
    }

    func testSearchingPrefix() {
        let result = OBDFrameParser.parse(response: "SEARCHING...\r41 0C 1A F8", expectedPID: 0x0C, byteCount: 2)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.rpm.parse(bytes), 1726)
    }

    func testNoData() {
        let result = OBDFrameParser.parse(response: "NO DATA", expectedPID: 0x0C, byteCount: 2)
        XCTAssertEqual(result, .noData)
    }

    func testBMWMode22OilTempN13_D3B0() {
        // MEVD1725: 90°C → A = 130 (0x82), formula A-40
        let bytes = OBDFrameParser.parseMode22(response: "62 D3 B0 82", did: 0xD3B0)
        XCTAssertEqual(bytes, [0x82])
        let c = OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes ?? [])
        XCTAssertEqual(c ?? -999, 90, accuracy: 0.1)
    }

    func testBMWMode22OilTempWithCANHeader_D3B0() {
        let bytes = OBDFrameParser.parseMode22(response: "7E8 03 62 D3 B0 82", did: 0xD3B0)
        XCTAssertEqual(bytes, [0x82])
        XCTAssertEqual(OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes ?? []) ?? -999, 90, accuracy: 0.1)
    }

    func testBMWMode22OilTempLegacy4402() {
        let bytes = OBDFrameParser.parseMode22(response: "62 44 02 00 B8", did: 0x4402)
        let c = OBDFrameParser.bmwOilTempLegacy4402C(fromMode22Bytes: bytes ?? [])
        XCTAssertEqual(c ?? -999, 90, accuracy: 0.5)
    }

    func testBMWMode22OilTempISOTPLengthNotSkipped() {
        let bytes = OBDFrameParser.parseMode22(
            response: "00A\r0: 62 D3 B0 82 00 00 00 00\r>",
            did: 0xD3B0
        )
        XCTAssertEqual(bytes?.first, 0x82)
    }

    func testBMWMode22OilTempRejectsGarbage() {
        XCTAssertNil(OBDFrameParser.parseMode22(response: "NO DATA", did: 0xD3B0))
        XCTAssertNil(OBDFrameParser.parseMode22(response: "41 5C 80", did: 0xD3B0))
    }

    func testBMWMode22OilPressureNearZeroAtRest() {
        let bytes = OBDFrameParser.parseMode22(response: "62 58 6F 09 00", did: 0x586F)
        let bar = OBDFrameParser.bmwOilPressureBar(fromMode22Bytes: bytes ?? [], ambientBaroKpa: 101.3)
        XCTAssertNotNil(bar)
        XCTAssertEqual(bar!, 0, accuracy: 0.1)
    }

    func testVLinkerCatalogHasN13OilPIDs() {
        let ids = Set(VLinkerPIDCatalog.extendedPIDs(for: .bmwF30N13).map(\.id))
        XCTAssertTrue(ids.contains("bmw.oilTemp.D3B0"))
        XCTAssertTrue(ids.contains("bmw.oilTemp.4402"))
        XCTAssertTrue(ids.contains("bmw.boost.2C10"))
        XCTAssertTrue(ids.contains("bmw.transOil.1E01"))
        XCTAssertTrue(ids.contains("bmw.coolant.F405"))
        XCTAssertTrue(ids.contains("bmw.ignition.2C05"))
        XCTAssertTrue(ids.contains("bmw.maf.2C20"))
        XCTAssertTrue(ids.contains("bmw.radiator.D3B2"))
        XCTAssertTrue(ids.contains("bmw.batterySoc.2D04"))
        let egs = VLinkerPIDCatalog.bmwTransmissionOil
        XCTAssertEqual(egs.header, "7E1")
        XCTAssertEqual(egs.command, "221E01")
    }

    func testBMWMode22IgnitionAndMafFormulas() {
        let ign = VLinkerPIDCatalog.bmwIgnitionAdvance.parse([0xA0], VehicleSnapshot()) // 80*0.5-64= -24? 0xA0=160 → 16
        XCTAssertEqual(ign ?? -999, 16, accuracy: 0.01)
        let maf = VLinkerPIDCatalog.bmwMaf.parse([0x01, 0xF4], VehicleSnapshot()) // 500*0.1=50
        XCTAssertEqual(maf ?? -999, 50, accuracy: 0.01)
        let amb = VLinkerPIDCatalog.bmwOutsideTemp.parse([0x64], VehicleSnapshot()) // 50-40=10
        XCTAssertEqual(amb ?? -999, 10, accuracy: 0.01)
    }

    func testBMWMode22TransmissionOil_1E01() {
        let bytes = OBDFrameParser.parseMode22(response: "7E9 03 62 1E 01 6E", did: 0x1E01)
        XCTAssertEqual(bytes, [0x6E])
        XCTAssertEqual(OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes ?? []) ?? -999, 70, accuracy: 0.1)
    }

    func testQuestion() {
        let result = OBDFrameParser.parse(response: "?", expectedPID: 0x0C, byteCount: 2)
        guard case .badResponse = result else { return XCTFail() }
    }

    func testSpeed() {
        let result = OBDFrameParser.parse(response: "41 0D 64", expectedPID: 0x0D, byteCount: 1)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.speed.parse(bytes), 100)
    }

    func testCoolant() {
        let result = OBDFrameParser.parse(response: "41 05 82", expectedPID: 0x05, byteCount: 1)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.coolant.parse(bytes), 90)
    }

    func testFuelLevel() {
        let result = OBDFrameParser.parse(response: "41 2F 80", expectedPID: 0x2F, byteCount: 1)
        guard case .value(let bytes) = result else { return XCTFail() }
        XCTAssertEqual(OBDPIDCatalog.fuelLevel.parse(bytes)!, 50.196, accuracy: 0.1)
    }

    func testLoad() {
        XCTAssertEqual(OBDPIDCatalog.engineLoad.parse([128])!, 50.196, accuracy: 0.1)
    }

    func testMAP() {
        XCTAssertEqual(OBDPIDCatalog.map.parse([101]), 101)
    }

    func testIntake() {
        XCTAssertEqual(OBDPIDCatalog.intakeAir.parse([65]), 25)
    }

    func testMAF() {
        XCTAssertEqual(OBDPIDCatalog.maf.parse([1, 244])!, 5.0, accuracy: 0.01)
    }

    func testThrottle() {
        XCTAssertEqual(OBDPIDCatalog.throttle.parse([255])!, 100, accuracy: 0.1)
    }

    func testVoltage() {
        XCTAssertEqual(OBDPIDCatalog.voltage.parse([0x37, 0x10])!, 14.096, accuracy: 0.01)
    }

    func testFuelRate() {
        XCTAssertEqual(OBDPIDCatalog.fuelRate.parse([0, 40])!, 2.0, accuracy: 0.01)
    }

    func testDTC() {
        let codes = OBDFrameParser.parseDTCResponse("43 01 33")
        XCTAssertEqual(codes.first?.code, "P0133")
    }

    func testUnableToConnect() {
        let result = OBDFrameParser.parse(response: "UNABLE TO CONNECT", expectedPID: 0x0C, byteCount: 2)
        XCTAssertEqual(result, .disconnected)
    }

    func testRetry() {
        XCTAssertEqual(OBDFrameParser.parse(response: "STOPPED", expectedPID: 0x0C, byteCount: 2), .retry)
        XCTAssertEqual(OBDFrameParser.parse(response: "CAN ERROR", expectedPID: 0x0C, byteCount: 2), .retry)
        XCTAssertEqual(OBDFrameParser.parse(response: "BUFFER FULL", expectedPID: 0x0C, byteCount: 2), .retry)
    }
}
