import Foundation

/// A single SAE J1979 emissions readiness monitor's state (Mode 01 PID 0x01).
/// `isSupported == false` means the vehicle doesn't have that monitor at all
/// (e.g. EVAP on some platforms) — that is not a fault, per PRD §38.
struct ReadinessMonitorStatus: Equatable, Sendable, Identifiable {
    enum Kind: String, CaseIterable, Sendable {
        case misfire
        case fuelSystem
        case components
        case egr
        case o2SensorHeater
        case o2Sensor
        case acRefrigerant
        case secondaryAir
        case evap
        case heatedCatalyst
        case catalyst
    }

    var id: Kind { kind }
    let kind: Kind
    let isSupported: Bool
    /// "Ready" = the monitor has completed its self-test this drive cycle.
    /// Meaningless when `isSupported == false`.
    let isReady: Bool
}

/// Decoded Mode 01 PID 0x01 response: MIL state, stored DTC count, and every
/// readiness monitor's supported/ready state. Layout is the standard SAE
/// J1979 4-byte "Monitor status since DTCs cleared" format — not vehicle- or
/// adapter-specific, so this is safe to decode without hardware validation.
struct ReadinessStatus: Equatable, Sendable {
    let milOn: Bool
    let dtcCount: Int
    let monitors: [ReadinessMonitorStatus]

    /// Only monitors the vehicle actually supports, for display (PRD §38).
    var supportedMonitors: [ReadinessMonitorStatus] { monitors.filter(\.isSupported) }

    /// True once every supported monitor has completed (no "Not Ready" left).
    var isFullyReady: Bool { supportedMonitors.allSatisfy(\.isReady) }
}

enum ReadinessParser {
    /// - Parameter bytes: the 4 data bytes following `41 01` in the response
    ///   (i.e. `OBDFrameParser.extractDataBytes(..., byteCount: 4)`'s result).
    static func parse(bytes: [UInt8]) -> ReadinessStatus? {
        guard bytes.count == 4 else { return nil }
        let a = bytes[0]
        let b = bytes[1]
        let c = bytes[2]
        let d = bytes[3]

        let milOn = (a & 0x80) != 0
        let dtcCount = Int(a & 0x7F)
        let isCompressionIgnition = (b & 0x08) != 0

        var monitors: [ReadinessMonitorStatus] = [
            ReadinessMonitorStatus(kind: .misfire, isSupported: (b & 0x01) != 0, isReady: (b & 0x10) == 0),
            ReadinessMonitorStatus(kind: .fuelSystem, isSupported: (b & 0x02) != 0, isReady: (b & 0x20) == 0),
            ReadinessMonitorStatus(kind: .components, isSupported: (b & 0x04) != 0, isReady: (b & 0x40) == 0)
        ]

        // Only the spark-ignition (gasoline) non-continuous monitor bit layout is
        // decoded here — this app's current target vehicles are gasoline (BMW N13
        // etc., see VehiclePlatform). The compression-ignition (diesel) byte C/D
        // layout differs and isn't decoded to avoid guessing an unverified mapping
        // (PRD "Grok Must Never: invent unsupported PID formulas"); a diesel session
        // still gets accurate MIL/DTC count and the three continuous monitors above.
        if !isCompressionIgnition {
            monitors += [
                ReadinessMonitorStatus(kind: .egr, isSupported: (c & 0x01) != 0, isReady: (d & 0x01) == 0),
                ReadinessMonitorStatus(kind: .o2SensorHeater, isSupported: (c & 0x02) != 0, isReady: (d & 0x02) == 0),
                ReadinessMonitorStatus(kind: .o2Sensor, isSupported: (c & 0x04) != 0, isReady: (d & 0x04) == 0),
                ReadinessMonitorStatus(kind: .acRefrigerant, isSupported: (c & 0x08) != 0, isReady: (d & 0x08) == 0),
                ReadinessMonitorStatus(kind: .evap, isSupported: (c & 0x10) != 0, isReady: (d & 0x10) == 0),
                ReadinessMonitorStatus(kind: .heatedCatalyst, isSupported: (c & 0x20) != 0, isReady: (d & 0x20) == 0),
                ReadinessMonitorStatus(kind: .secondaryAir, isSupported: (c & 0x40) != 0, isReady: (d & 0x40) == 0),
                ReadinessMonitorStatus(kind: .catalyst, isSupported: (c & 0x80) != 0, isReady: (d & 0x80) == 0)
            ]
        }

        return ReadinessStatus(milOn: milOn, dtcCount: dtcCount, monitors: monitors)
    }
}
