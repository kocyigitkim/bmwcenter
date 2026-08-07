import XCTest
@testable import BMWCenter

final class VINDecoderTests: XCTestCase {
    func testValidBMWVIN() {
        let vin = assemble(wmiVds: "WBA3A5C5", year: "E", plantSerial: "F123456")
        let info = VINDecoder.decode(vin)
        XCTAssertNotNil(info)
        XCTAssertEqual(info?.wmi, "WBA")
        XCTAssertEqual(info?.manufacturer, "BMW")
        XCTAssertTrue(info?.isCheckDigitValid ?? false)
        XCTAssertEqual(vin.count, 17)
    }

    func testRejectsIOQ() {
        XCTAssertNil(VINDecoder.decode("WBA3A5C5OEF123456"))
    }

    func testRejectsWrongLength() {
        XCTAssertNil(VINDecoder.decode("WBA3A5C50EF12345"))
    }

    func testModelYearTable() {
        let vin = assemble(wmiVds: "WBA3A5C5", year: "G", plantSerial: "F123456")
        XCTAssertEqual(VINDecoder.decode(vin)?.modelYear, 2016)
    }

    func testInvalidCheckDigitFlagged() {
        var chars = Array(assemble(wmiVds: "WBA3A5C5", year: "E", plantSerial: "F123456"))
        chars[8] = chars[8] == "X" ? "1" : "X"
        let info = VINDecoder.decode(String(chars))
        XCTAssertNotNil(info)
        XCTAssertFalse(info!.isCheckDigitValid)
    }

    func testValidateCheckDigitDirect() {
        let vin = assemble(wmiVds: "WVWZZZ1J", year: "Z", plantSerial: "XW00001")
        // May or may not be BMW; just ensure algorithm is consistent
        XCTAssertEqual(VINDecoder.validateCheckDigit(vin), true)
    }

    private func assemble(wmiVds: String, year: Character, plantSerial: String) -> String {
        precondition(wmiVds.count == 8)
        precondition(plantSerial.count == 7)
        let partial = Array(wmiVds + "0" + String(year) + plantSerial)
        let weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
        let map: [Character: Int] = [
            "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8,
            "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7, "R": 9,
            "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7, "Y": 8, "Z": 9,
            "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9
        ]
        var sum = 0
        for i in 0..<17 {
            sum += (map[partial[i]] ?? 0) * weights[i]
        }
        let rem = sum % 11
        let check: Character = rem == 10 ? "X" : Character(String(rem))
        var chars = partial
        chars[8] = check
        return String(chars)
    }
}
