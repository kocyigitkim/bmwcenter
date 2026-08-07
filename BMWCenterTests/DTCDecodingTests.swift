import XCTest
@testable import BMWCenter

final class DTCDecodingTests: XCTestCase {
    func testParseP0133() {
        // Mode 43 + P0133 → bytes 0x01 0x33
        let response = "43 01 33"
        let codes = OBDFrameParser.parseDTCResponse(response)
        XCTAssertEqual(codes.first?.code, "P0133")
    }

    func testFourFamilies() {
        // P0001=00 01, C0001=40 01, B0001=80 01, U0001=C0 01
        let response = "43 00 01 40 01 80 01 C0 01"
        let codes = OBDFrameParser.parseDTCResponse(response).map(\.code)
        XCTAssertTrue(codes.contains("P0001"))
        XCTAssertTrue(codes.contains("C0001"))
        XCTAssertTrue(codes.contains("B0001"))
        XCTAssertTrue(codes.contains("U0001"))
    }

    func testCatalogHasP0133() {
        let url = Bundle.main.url(forResource: "DTCCatalog", withExtension: "json")
        XCTAssertNotNil(url)
        let data = try! Data(contentsOf: url!)
        let json = try! JSONSerialization.jsonObject(with: data) as! [String: Any]
        let entry = json["P0133"] as? [String: Any]
        XCTAssertEqual(entry?["titleKey"] as? String, "dtc.P0133.title")
        XCTAssertEqual(entry?["systemKey"] as? String, "dtc.system.fuelAir")
        XCTAssertEqual(entry?["severity"] as? String, "medium")
        XCTAssertNotNil(entry?["en"] as? String)
        XCTAssertNotNil(entry?["tr"] as? String)
    }

    func testCatalogHasBMWPriorityCodes() {
        let url = Bundle.main.url(forResource: "DTCCatalog", withExtension: "json")!
        let json = try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
        for code in ["P0016", "P0171", "P0300", "P0420", "P1519", "P1120"] {
            let entry = json[code] as? [String: Any]
            XCTAssertEqual(entry?["bmw"] as? Bool, true, code)
            XCTAssertFalse(((entry?["tr"] as? String) ?? "").isEmpty, code)
        }
        XCTAssertGreaterThanOrEqual(json.count, 30)
    }

    func testNoDataReturnsEmpty() {
        XCTAssertTrue(OBDFrameParser.parseDTCResponse("NO DATA").isEmpty)
    }
}
