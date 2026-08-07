import Foundation

enum OBDFrameParseResult: Equatable {
    case value([UInt8])
    case noData
    case retry
    case badResponse(String)
    case disconnected
}

enum OBDFrameParser {
    static func parse(response: String, expectedPID: UInt8, byteCount: Int) -> OBDFrameParseResult {
        let upper = response.uppercased()
        if upper.contains("UNABLE TO CONNECT") { return .disconnected }
        if upper.contains("NO DATA") { return .noData }
        if upper.trimmingCharacters(in: .whitespacesAndNewlines) == "?" { return .badResponse("?") }
        if upper.contains("STOPPED") || upper.contains("CAN ERROR") || upper.contains("BUFFER FULL") {
            return .retry
        }

        let lines = upper
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.hasPrefix("SEARCHING") && $0 != ">" && !$0.hasPrefix("OK") }

        for line in lines {
            if let bytes = extractDataBytes(from: line, expectedPID: expectedPID, byteCount: byteCount) {
                return .value(bytes)
            }
        }
        return .badResponse(response)
    }

    static func extractDataBytes(from line: String, expectedPID: UInt8, byteCount: Int) -> [UInt8]? {
        // Prefer space-separated tokens (handles 11-bit CAN IDs like "7E8")
        let tokens = line.split(whereSeparator: { $0.isWhitespace })
        var bytes: [UInt8] = []
        if tokens.count >= 2, tokens.contains(where: { $0.count == 2 || $0.count == 1 }) {
            for token in tokens {
                let t = String(token).filter { $0.isHexDigit }
                guard !t.isEmpty else { continue }
                if t.count == 3 {
                    // 11-bit CAN header — keep low byte for scanning continuity
                    if let hi = UInt8(String(t.prefix(1)), radix: 16),
                       let lo = UInt8(String(t.suffix(2)), radix: 16) {
                        bytes.append(hi)
                        bytes.append(lo)
                    }
                    continue
                }
                if t.count % 2 == 1 { continue }
                var i = t.startIndex
                while i < t.endIndex {
                    let n = t.index(i, offsetBy: 2)
                    if let b = UInt8(t[i..<n], radix: 16) { bytes.append(b) }
                    i = n
                }
            }
        }
        if bytes.count < 2 + byteCount {
            let hex = line.filter { $0.isHexDigit }
            guard hex.count >= 2 + byteCount * 2 else { return nil }
            // Drop leading nibble if odd length (common with 7E8… concatenated)
            let startOffset = hex.count % 2
            bytes = []
            var idx = hex.index(hex.startIndex, offsetBy: startOffset)
            while idx < hex.endIndex {
                let next = hex.index(idx, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
                guard hex.distance(from: idx, to: next) == 2,
                      let b = UInt8(hex[idx..<next], radix: 16) else { break }
                bytes.append(b)
                idx = next
            }
        }
        guard bytes.count >= 2 + byteCount else { return nil }

        // Find 41 (mode 01 + 0x40) then PID
        for i in 0..<bytes.count {
            if bytes[i] == 0x41, i + 1 < bytes.count, bytes[i + 1] == expectedPID {
                let start = i + 2
                let end = start + byteCount
                guard end <= bytes.count else { return nil }
                return Array(bytes[start..<end])
            }
        }
        return nil
    }

    /// Mode 22 positive response: `62 <DID_H> <DID_L> <data…>`
    /// Handles spaced frames, CAN id `7E8`, and ISO-TP length prefixes.
    static func parseMode22(response: String, did: UInt16) -> [UInt8]? {
        let upper = response.uppercased()
        if upper.contains("NO DATA") || upper.contains("UNABLE TO CONNECT") { return nil }
        if upper.trimmingCharacters(in: .whitespacesAndNewlines) == "?" { return nil }

        let didHi = UInt8((did >> 8) & 0xFF)
        let didLo = UInt8(did & 0xFF)

        // Prefer tokenized parse so 11-bit CAN IDs (3 hex chars) do not shift the stream.
        let lines = upper
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.hasPrefix("SEARCHING") && $0 != ">" && !$0.hasPrefix("OK") }

        for line in lines {
            // Strip ISO-TP continuum prefixes: "0:", "1:", "014:" etc.
            var work = line
            if let idx = work.firstIndex(of: ":") {
                let head = work[..<idx].filter(\.isHexDigit)
                if !head.isEmpty, head.count <= 3 {
                    work = String(work[work.index(after: idx)...])
                        .trimmingCharacters(in: .whitespaces)
                }
            }
            let tokens = work.split(whereSeparator: { $0.isWhitespace })
            var bytes: [UInt8] = []
            for token in tokens {
                let t = String(token).filter { $0.isHexDigit }
                guard !t.isEmpty else { continue }
                // Only skip real 11-bit ECU addresses (7E0–7EF), not ISO-TP lengths like 00A/014.
                if t.count == 3, t.hasPrefix("7E") { continue }
                if t.count % 2 == 1 {
                    // Odd length: keep as nibble-pairs from the right if long enough, else skip.
                    guard t.count >= 3 else { continue }
                }
                let hexPairs = t.count % 2 == 1 ? String(t.dropFirst()) : t
                var i = hexPairs.startIndex
                while i < hexPairs.endIndex {
                    let n = hexPairs.index(i, offsetBy: 2)
                    if let b = UInt8(hexPairs[i..<n], radix: 16) { bytes.append(b) }
                    i = n
                }
            }
            if let data = mode22Payload(in: bytes, didHi: didHi, didLo: didLo) {
                return data
            }
        }

        // Fallback: continuous hex, scan for 62 DID anywhere (skip leading odd nibble).
        let hex = upper.filter { $0.isHexDigit }
        guard hex.count >= 8 else { return nil }
        for start in 0...1 {
            var bytes: [UInt8] = []
            var idx = hex.index(hex.startIndex, offsetBy: start, limitedBy: hex.endIndex) ?? hex.endIndex
            while hex.distance(from: idx, to: hex.endIndex) >= 2 {
                let next = hex.index(idx, offsetBy: 2)
                if let b = UInt8(hex[idx..<next], radix: 16) { bytes.append(b) }
                idx = next
            }
            if let data = mode22Payload(in: bytes, didHi: didHi, didLo: didLo) {
                return data
            }
        }
        return nil
    }

    private static func mode22Payload(in bytes: [UInt8], didHi: UInt8, didLo: UInt8) -> [UInt8]? {
        guard bytes.count >= 3 else { return nil }
        for i in 0..<bytes.count {
            if bytes[i] == 0x62,
               i + 2 < bytes.count,
               bytes[i + 1] == didHi,
               bytes[i + 2] == didLo {
                return Array(bytes[(i + 3)...])
            }
        }
        return nil
    }

    /// BMW F30/N13 MEVD1725 oil temp — Mode 22 DID `D3B0`: °C = A − 40.
    static func bmwOilTempC(fromMode22Bytes bytes: [UInt8]) -> Double? {
        guard let a = bytes.first else { return nil }
        let celsius = Double(a) - 40
        guard celsius > -40, celsius < 160 else { return nil }
        return celsius
    }

    /// Legacy Torque F20/N13 DID `4402`: `(A*256+B)*191.25/255-48`.
    static func bmwOilTempLegacy4402C(fromMode22Bytes bytes: [UInt8]) -> Double? {
        guard bytes.count >= 2 else {
            guard let a = bytes.first else { return nil }
            let alt = Double(a) - 40
            return (alt > -40 && alt < 160) ? alt : nil
        }
        let raw = Double(bytes[0]) * 256 + Double(bytes[1])
        let celsius = raw * 191.25 / 255.0 - 48.0
        guard celsius > -40, celsius < 160 else { return nil }
        return celsius
    }

    /// BMW N13 oil pressure (Mode 22 DID 586F). Byte A scales to absolute hPa; gauge bar vs atmosphere.
    static func bmwOilPressureBar(fromMode22Bytes bytes: [UInt8], ambientBaroKpa: Double?) -> Double? {
        guard let a = bytes.first else { return nil }
        // Community calibration: A≈9 → ~1058 hPa absolute at rest.
        let absHpa = Double(a) * 117.556
        let atmHpa = (ambientBaroKpa ?? 101.3) * 10.0
        let gaugeBar = (absHpa - atmHpa) / 1000.0
        guard gaugeBar > -0.5, gaugeBar < 10 else { return nil }
        return gaugeBar
    }

    static func parseDTCResponse(_ response: String) -> [DTC] {
        let upper = response.uppercased()
        if upper.contains("NO DATA") { return [] }
        let hex = upper.filter { $0.isHexDigit }
        guard hex.count >= 2 else { return [] }
        var bytes: [UInt8] = []
        var idx = hex.startIndex
        while idx < hex.endIndex {
            let next = hex.index(idx, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            if hex.distance(from: idx, to: next) < 2 { break }
            if let b = UInt8(hex[idx..<next], radix: 16) { bytes.append(b) }
            idx = next
        }

        // Skip mode echo 43 (stored), 47 (pending), 4A (permanent)
        var start = 0
        for mode in [UInt8(0x43), 0x47, 0x4A] {
            if let i = bytes.firstIndex(of: mode) {
                start = i + 1
                break
            }
        }
        var codes: [DTC] = []
        var i = start
        let letters = ["P", "C", "B", "U"]
        while i + 1 < bytes.count {
            let a = bytes[i]
            let b = bytes[i + 1]
            i += 2
            if a == 0 && b == 0 { continue }
            let type = Int((a & 0xC0) >> 6)
            let d1 = (a & 0x30) >> 4
            let d2 = a & 0x0F
            let d3 = (b & 0xF0) >> 4
            let d4 = b & 0x0F
            let code = String(format: "%@%X%X%X%X", letters[type], d1, d2, d3, d4)
            codes.append(DTC(code: code, status: .stored, descriptionKey: nil))
        }
        return codes
    }

    /// ISO-TP multi-frame VIN (Mode 09 PID 02).
    static func parseVIN(_ response: String) -> String? {
        let upper = response.uppercased()
        let lines = upper
            .replacingOccurrences(of: "\r", with: "\n")
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && $0 != ">" }

        var hex = ""
        for line in lines {
            var s = line
            if let colon = s.firstIndex(of: ":") {
                s = String(s[s.index(after: colon)...])
            }
            // Drop leading length nibble lines like "014"
            if s.count == 3, s.allSatisfy(\.isHexDigit) { continue }
            hex += s.filter { $0.isHexDigit }
        }
        guard hex.count >= 6 else { return nil }
        var bytes: [UInt8] = []
        var idx = hex.startIndex
        while idx < hex.endIndex {
            let next = hex.index(idx, offsetBy: 2, limitedBy: hex.endIndex) ?? hex.endIndex
            guard hex.distance(from: idx, to: next) == 2,
                  let b = UInt8(hex[idx..<next], radix: 16) else { break }
            bytes.append(b)
            idx = next
        }
        // Find 49 02 01 prefix
        guard let start = bytes.firstIndex(of: 0x49),
              start + 2 < bytes.count,
              bytes[start + 1] == 0x02 else { return nil }
        let payloadStart = start + 3
        guard payloadStart < bytes.count else { return nil }
        let ascii = bytes[payloadStart...].compactMap { b -> Character? in
            guard b >= 32, b < 127 else { return nil }
            return Character(UnicodeScalar(b))
        }
        let vin = String(ascii).filter { $0.isLetter || $0.isNumber }
        guard vin.count == 17 else { return vin.count >= 17 ? String(vin.prefix(17)) : nil }
        return vin
    }
}
