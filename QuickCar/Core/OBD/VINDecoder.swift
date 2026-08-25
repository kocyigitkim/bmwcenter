import Foundation

struct VINInfo: Sendable, Equatable {
    var wmi: String
    var manufacturer: String?
    var modelYear: Int?
    var plantCode: String
    var serial: String
    var isCheckDigitValid: Bool
}

enum VINDecoder {
    private static let invalidChars: Set<Character> = ["I", "O", "Q"]

    private static let transliteration: [Character: Int] = [
        "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8,
        "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7, "R": 9,
        "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7, "Y": 8, "Z": 9,
        "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9
    ]

    private static let weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

    private static let yearTable: [Character: Int] = {
        var map: [Character: Int] = [:]
        // A=2010 … Y=2030 (skip I,O,Q,U,Z per VIN year encoding)
        let letters: [(Character, Int)] = [
            ("A", 2010), ("B", 2011), ("C", 2012), ("D", 2013), ("E", 2014),
            ("F", 2015), ("G", 2016), ("H", 2017), ("J", 2018), ("K", 2019),
            ("L", 2020), ("M", 2021), ("N", 2022), ("P", 2023), ("R", 2024),
            ("S", 2025), ("T", 2026), ("V", 2027), ("W", 2028), ("X", 2029),
            ("Y", 2030)
        ]
        for (c, y) in letters { map[c] = y }
        for i in 1...9 {
            map[Character(String(i))] = 2000 + i
        }
        return map
    }()

    private static let wmiTable: [String: String] = [
        "WBA": "BMW",
        "WBS": "BMW M",
        "WBY": "BMW i",
        "WVW": "Volkswagen",
        "WAU": "Audi",
        "WDD": "Mercedes-Benz",
        "WDB": "Mercedes-Benz",
        "WDC": "Mercedes-Benz",
        "W1K": "Mercedes-Benz",
        "W1N": "Mercedes-Benz",
        "WF0": "Ford",
        "VS6": "Ford",
        "VF1": "Renault",
        "VF3": "Peugeot",
        "VF7": "Citroën",
        "UU1": "Dacia",
        "ZFA": "Fiat",
        "ZFF": "Ferrari",
        "ZAR": "Alfa Romeo",
        "SAJ": "Jaguar",
        "SAL": "Land Rover",
        "1G1": "Chevrolet",
        "1FA": "Ford",
        "1HG": "Honda",
        "2HG": "Honda",
        "JHM": "Honda",
        "3VW": "Volkswagen",
        "TMB": "Skoda",
        "TRU": "Audi",
        "W0L": "Opel",
        "JM1": "Mazda",
        "JN1": "Nissan",
        "JT": "Toyota",
        "4T": "Toyota",
        "NMT": "Toyota",
        "KMH": "Hyundai",
        "NLH": "Hyundai",
        "KNA": "Kia",
        "YV1": "Volvo",
        "5YJ": "Tesla",
        "7SA": "Tesla",
        "WP0": "Porsche",
        "1C4": "Jeep",
        "JF1": "Subaru",
        "JF2": "Subaru",
        "NLC": "Togg",
        "LVG": "MG",
        "LGB": "BYD"
    ]

    static func decode(_ vin: String) -> VINInfo? {
        let cleaned = vin.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        guard cleaned.count == 17 else { return nil }
        guard cleaned.allSatisfy({ $0.isLetter || $0.isNumber }) else { return nil }
        guard !cleaned.contains(where: { invalidChars.contains($0) }) else { return nil }

        let chars = Array(cleaned)
        let wmi = String(chars[0..<3])
        let plant = String(chars[10])
        let serial = String(chars[11..<17])
        let yearChar = chars[9]
        let modelYear = yearTable[yearChar]
        let manufacturer = lookupManufacturer(wmi: wmi)
        let checkOK = validateCheckDigit(cleaned)

        return VINInfo(
            wmi: wmi,
            manufacturer: manufacturer,
            modelYear: modelYear,
            plantCode: plant,
            serial: serial,
            isCheckDigitValid: checkOK
        )
    }

    static func validateCheckDigit(_ vin: String) -> Bool {
        let cleaned = vin.uppercased()
        guard cleaned.count == 17 else { return false }
        let chars = Array(cleaned)
        var sum = 0
        for i in 0..<17 {
            guard let value = transliteration[chars[i]] else { return false }
            sum += value * weights[i]
        }
        let remainder = sum % 11
        let expected: Character = remainder == 10 ? "X" : Character(String(remainder))
        return chars[8] == expected
    }

    private static func lookupManufacturer(wmi: String) -> String? {
        if let m = wmiTable[wmi] { return m }
        if wmi.count >= 2, let m = wmiTable[String(wmi.prefix(2))] { return m }
        return nil
    }
}
