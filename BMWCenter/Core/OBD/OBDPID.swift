import Foundation

struct OBDPID: Hashable, Sendable {
    let mode: UInt8
    let pid: UInt8
    let byteCount: Int
    let key: String
    let parse: @Sendable ([UInt8]) -> Double?

    func hash(into hasher: inout Hasher) {
        hasher.combine(mode)
        hasher.combine(pid)
    }

    static func == (lhs: OBDPID, rhs: OBDPID) -> Bool {
        lhs.mode == rhs.mode && lhs.pid == rhs.pid
    }
}

enum OBDPIDCatalog {
    private static func trim(_ b: [UInt8]) -> Double? {
        guard let a = b.first else { return nil }
        return Double(a) / 1.28 - 100
    }

    private static func pct(_ b: [UInt8]) -> Double? {
        guard let a = b.first else { return nil }
        return Double(a) * 100 / 255
    }

    private static func temp(_ b: [UInt8]) -> Double? {
        guard let a = b.first else { return nil }
        return Double(a) - 40
    }

    static let engineLoad = OBDPID(mode: 0x01, pid: 0x04, byteCount: 1, key: "engineLoad", parse: pct)
    static let coolant = OBDPID(mode: 0x01, pid: 0x05, byteCount: 1, key: "coolant", parse: temp)
    static let stft1 = OBDPID(mode: 0x01, pid: 0x06, byteCount: 1, key: "stft1", parse: trim)
    static let ltft1 = OBDPID(mode: 0x01, pid: 0x07, byteCount: 1, key: "ltft1", parse: trim)
    static let stft2 = OBDPID(mode: 0x01, pid: 0x08, byteCount: 1, key: "stft2", parse: trim)
    static let ltft2 = OBDPID(mode: 0x01, pid: 0x09, byteCount: 1, key: "ltft2", parse: trim)
    static let fuelPressure = OBDPID(mode: 0x01, pid: 0x0A, byteCount: 1, key: "fuelPressure") { b in
        guard let a = b.first else { return nil }
        return Double(a) * 3
    }
    static let map = OBDPID(mode: 0x01, pid: 0x0B, byteCount: 1, key: "map") { b in
        guard let a = b.first else { return nil }
        return Double(a)
    }
    static let rpm = OBDPID(mode: 0x01, pid: 0x0C, byteCount: 2, key: "rpm") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) / 4
    }
    static let speed = OBDPID(mode: 0x01, pid: 0x0D, byteCount: 1, key: "speed") { b in
        guard let a = b.first else { return nil }
        return Double(a)
    }
    static let timing = OBDPID(mode: 0x01, pid: 0x0E, byteCount: 1, key: "timing") { b in
        guard let a = b.first else { return nil }
        return Double(a) / 2 - 64
    }
    static let intakeAir = OBDPID(mode: 0x01, pid: 0x0F, byteCount: 1, key: "intakeAir", parse: temp)
    static let maf = OBDPID(mode: 0x01, pid: 0x10, byteCount: 2, key: "maf") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) / 100
    }
    static let throttle = OBDPID(mode: 0x01, pid: 0x11, byteCount: 1, key: "throttle", parse: pct)
    static let runtime = OBDPID(mode: 0x01, pid: 0x1F, byteCount: 2, key: "runtime") { b in
        guard b.count >= 2 else { return nil }
        return Double(b[0]) * 256 + Double(b[1])
    }
    static let distMIL = OBDPID(mode: 0x01, pid: 0x21, byteCount: 2, key: "distMIL") { b in
        guard b.count >= 2 else { return nil }
        return Double(b[0]) * 256 + Double(b[1])
    }
    static let fuelRail = OBDPID(mode: 0x01, pid: 0x23, byteCount: 2, key: "fuelRail") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) * 10
    }
    static let egr = OBDPID(mode: 0x01, pid: 0x2C, byteCount: 1, key: "egr", parse: pct)
    static let fuelLevel = OBDPID(mode: 0x01, pid: 0x2F, byteCount: 1, key: "fuelLevel", parse: pct)
    static let distClear = OBDPID(mode: 0x01, pid: 0x31, byteCount: 2, key: "distClear") { b in
        guard b.count >= 2 else { return nil }
        return Double(b[0]) * 256 + Double(b[1])
    }
    static let baro = OBDPID(mode: 0x01, pid: 0x33, byteCount: 1, key: "baro") { b in
        guard let a = b.first else { return nil }
        return Double(a)
    }
    static let catalyst = OBDPID(mode: 0x01, pid: 0x3C, byteCount: 2, key: "catalyst") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) / 10 - 40
    }
    static let voltage = OBDPID(mode: 0x01, pid: 0x42, byteCount: 2, key: "voltage") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) / 1000
    }
    static let relativeThrottle = OBDPID(mode: 0x01, pid: 0x45, byteCount: 1, key: "relThrottle", parse: pct)
    static let ambient = OBDPID(mode: 0x01, pid: 0x46, byteCount: 1, key: "ambient", parse: temp)
    static let pedal = OBDPID(mode: 0x01, pid: 0x49, byteCount: 1, key: "pedal", parse: pct)
    static let oilTemp = OBDPID(mode: 0x01, pid: 0x5C, byteCount: 1, key: "oilTemp", parse: temp)
    static let fuelRate = OBDPID(mode: 0x01, pid: 0x5E, byteCount: 2, key: "fuelRate") { b in
        guard b.count >= 2 else { return nil }
        return (Double(b[0]) * 256 + Double(b[1])) / 20
    }

    static let all: [OBDPID] = [
        engineLoad, coolant, stft1, ltft1, stft2, ltft2, fuelPressure, map, rpm, speed,
        timing, intakeAir, maf, throttle, runtime, distMIL, fuelRail, egr, fuelLevel,
        distClear, baro, catalyst, voltage, relativeThrottle, ambient, pedal, oilTemp, fuelRate
    ]

    static func pid(_ value: UInt8) -> OBDPID? {
        all.first { $0.pid == value }
    }

    static func apply(_ value: Double, pid: UInt8, into snapshot: inout VehicleSnapshot) {
        switch pid {
        case 0x04: snapshot.engineLoadPct = value
        case 0x05: snapshot.coolantC = value
        case 0x06: snapshot.stftBank1 = value
        case 0x07: snapshot.ltftBank1 = value
        case 0x08: snapshot.stftBank2 = value
        case 0x09: snapshot.ltftBank2 = value
        case 0x0B: snapshot.mapKpa = value
        case 0x0C: snapshot.rpm = value
        case 0x0D: snapshot.speedKmh = value
        case 0x0E: snapshot.timingAdvance = value
        case 0x0F: snapshot.intakeAirC = value
        case 0x10: snapshot.mafGs = value
        case 0x11: snapshot.throttlePct = value
        case 0x1F: snapshot.runtimeS = value
        case 0x21: snapshot.distanceWithMILKm = value
        case 0x23: snapshot.fuelRailKpa = value
        case 0x2F: snapshot.fuelLevelPct = value
        case 0x31: snapshot.distanceSinceClearKm = value
        case 0x33: snapshot.baroKpa = value
        case 0x3C: snapshot.catalystC = value
        case 0x42: snapshot.voltage = value
        case 0x45: snapshot.throttlePct = value
        case 0x46: snapshot.ambientC = value
        case 0x49: snapshot.pedalPct = value
        case 0x5C: snapshot.oilTempC = value
        case 0x5E: snapshot.engineFuelRateLh = value
        default: break
        }
    }

    static func parseSupportedBitmask(_ bytes: [UInt8], base: UInt8) -> Set<UInt8> {
        var result = Set<UInt8>()
        guard bytes.count >= 4 else { return result }
        for i in 0..<4 {
            let byte = bytes[i]
            for bit in 0..<8 {
                if (byte & (0x80 >> bit)) != 0 {
                    result.insert(base + UInt8(i * 8 + bit + 1))
                }
            }
        }
        return result
    }
}
