import Foundation

/// Vehicle platforms that unlock manufacturer Mode-22 PIDs on VLinker (ELM327/STN).
enum VehiclePlatform: String, CaseIterable, Codable, Sendable {
    case universal
    case bmwF30N13
    case bmwFSeries

    var displayKey: String {
        switch self {
        case .universal: return "vehicle.platform.universal"
        case .bmwF30N13: return "vehicle.platform.bmwF30N13"
        case .bmwFSeries: return "vehicle.platform.bmwFSeries"
        }
    }
}

/// Where a decoded value is written on `VehicleSnapshot`.
enum SnapshotMetric: String, Sendable {
    case oilTempC
    case transmissionOilTempC
    case oilPressureBar
    case boostSetpointKpa
    case boostActualKpa
    case fuelRailBar
    case coolantC
    case radiatorOutletC
    case intercoolerC
    case ambientC
    case ignitionAdvanceDeg
    case throttlePct
    case pedalPct
    case mafKgh
    case vanosIntakeDeg
    case vanosExhaustDeg
    case lowPressureFuelBar
    case alternatorVoltage
    case batterySocPct
}

enum VLinkerPollTier: Sendable {
    case fast      // ~0.2 s
    case medium    // ~1–2 s
    case slow      // ~5 s
    case rare      // ~30 s
}

/// One PID/command VLinker can transport (standard OBD-II or BMW Mode 22).
struct VLinkerPIDDefinition: Identifiable, Sendable {
    enum Kind: Sendable {
        case mode01(pid: UInt8)
        case mode22(did: UInt16, header: String)
    }

    let id: String
    let titleKey: String
    let kind: Kind
    let byteCount: Int
    let tier: VLinkerPollTier
    let platforms: Set<VehiclePlatform>
    let metric: SnapshotMetric?
    let parse: @Sendable (_ bytes: [UInt8], _ snap: VehicleSnapshot) -> Double?

    var command: String {
        switch kind {
        case .mode01(let pid):
            return ELM327Commands.mode01(pid)
        case .mode22(let did, _):
            return String(format: "22%04X", did)
        }
    }

    var header: String? {
        if case .mode22(_, let header) = kind { return header }
        return nil
    }
}

/// VLinker MC/MC+ speaks full ELM327 — all Mode 01 PIDs below are transport-capable.
/// BMW F30/N13 (MEVD1725) Mode 22 DIDs — DME `7E0`/`7DF`, EGS `7E1`, IBS/gateway `6F1`.
enum VLinkerPIDCatalog {
    static let dmeHeader = "7E0"
    static let egsHeader = "7E1"
    /// BMW diagnostic gateway / body path used for some IBS-adjacent reads.
    static let gatewayHeader = "6F1"

    private static let bmwPlatforms: Set<VehiclePlatform> = [.bmwF30N13, .bmwFSeries]

    // MARK: - Engine oil / coolant / boost / rail

    static let bmwOilTemp = VLinkerPIDDefinition(
        id: "bmw.oilTemp.D3B0",
        titleKey: "metric.oilTemp",
        kind: .mode22(did: 0xD3B0, header: dmeHeader),
        byteCount: 1,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .oilTempC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes) }
    )

    static let bmwOilTempLegacy4402 = VLinkerPIDDefinition(
        id: "bmw.oilTemp.4402",
        titleKey: "metric.oilTemp",
        kind: .mode22(did: 0x4402, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .oilTempC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempLegacy4402C(fromMode22Bytes: bytes) }
    )

    static let bmwCoolantMode22 = VLinkerPIDDefinition(
        id: "bmw.coolant.F405",
        titleKey: "metric.coolant",
        kind: .mode22(did: 0xF405, header: dmeHeader),
        byteCount: 1,
        tier: .slow,
        platforms: bmwPlatforms,
        metric: .coolantC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes) }
    )

    static let bmwBoostActual = VLinkerPIDDefinition(
        id: "bmw.boost.2C10",
        titleKey: "metric.boost",
        kind: .mode22(did: 0x2C10, header: dmeHeader),
        byteCount: 2,
        tier: .fast,
        platforms: bmwPlatforms,
        metric: .boostActualKpa,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) / 10.0
        }
    )

    static let bmwBoostTarget = VLinkerPIDDefinition(
        id: "bmw.boost.2C11",
        titleKey: "metric.boostSetpoint",
        kind: .mode22(did: 0x2C11, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .boostSetpointKpa,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) / 10.0
        }
    )

    static let bmwFuelRail = VLinkerPIDDefinition(
        id: "bmw.fuelRail.2B0D",
        titleKey: "metric.fuelRail",
        kind: .mode22(did: 0x2B0D, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .fuelRailBar,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.1
        }
    )

    static let bmwOilPressure = VLinkerPIDDefinition(
        id: "bmw.oilPressure.586F",
        titleKey: "metric.oilPressure",
        kind: .mode22(did: 0x586F, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .oilPressureBar,
        parse: { bytes, snap in
            OBDFrameParser.bmwOilPressureBar(fromMode22Bytes: bytes, ambientBaroKpa: snap.baroKpa)
        }
    )

    static let bmwTransmissionOil = VLinkerPIDDefinition(
        id: "bmw.transOil.1E01",
        titleKey: "metric.transmissionOilTemp",
        kind: .mode22(did: 0x1E01, header: egsHeader),
        byteCount: 1,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .transmissionOilTempC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes) }
    )

    // MARK: - Air & ignition

    static let bmwIgnitionAdvance = VLinkerPIDDefinition(
        id: "bmw.ignition.2C05",
        titleKey: "metric.ignitionAdvance",
        kind: .mode22(did: 0x2C05, header: dmeHeader),
        byteCount: 1,
        tier: .fast,
        platforms: bmwPlatforms,
        metric: .ignitionAdvanceDeg,
        parse: { bytes, _ in
            guard let a = bytes.first else { return nil }
            return Double(a) * 0.5 - 64
        }
    )

    static let bmwThrottleAngle = VLinkerPIDDefinition(
        id: "bmw.throttle.1005",
        titleKey: "metric.throttle",
        kind: .mode22(did: 0x1005, header: dmeHeader),
        byteCount: 1,
        tier: .fast,
        platforms: bmwPlatforms,
        metric: .throttlePct,
        parse: { bytes, _ in
            guard let a = bytes.first else { return nil }
            return Double(a) * 0.3921
        }
    )

    static let bmwPedalPosition = VLinkerPIDDefinition(
        id: "bmw.pedal.1011",
        titleKey: "metric.pedal",
        kind: .mode22(did: 0x1011, header: dmeHeader),
        byteCount: 1,
        tier: .fast,
        platforms: bmwPlatforms,
        metric: .pedalPct,
        parse: { bytes, _ in
            guard let a = bytes.first else { return nil }
            return Double(a) * 0.3921
        }
    )

    static let bmwMaf = VLinkerPIDDefinition(
        id: "bmw.maf.2C20",
        titleKey: "metric.maf",
        kind: .mode22(did: 0x2C20, header: dmeHeader),
        byteCount: 2,
        tier: .fast,
        platforms: bmwPlatforms,
        metric: .mafKgh,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.1
        }
    )

    static let bmwVanosIntake = VLinkerPIDDefinition(
        id: "bmw.vanos.in.2C30",
        titleKey: "metric.vanosIntake",
        kind: .mode22(did: 0x2C30, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .vanosIntakeDeg,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.1
        }
    )

    static let bmwVanosExhaust = VLinkerPIDDefinition(
        id: "bmw.vanos.ex.2C31",
        titleKey: "metric.vanosExhaust",
        kind: .mode22(did: 0x2C31, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .vanosExhaustDeg,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.1
        }
    )

    // MARK: - Temperature & pressure

    static let bmwRadiatorOutlet = VLinkerPIDDefinition(
        id: "bmw.radiator.D3B2",
        titleKey: "metric.radiatorOutlet",
        kind: .mode22(did: 0xD3B2, header: dmeHeader),
        byteCount: 1,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .radiatorOutletC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes) }
    )

    static let bmwIntercooler = VLinkerPIDDefinition(
        id: "bmw.intercooler.2C0B",
        titleKey: "metric.intercooler",
        kind: .mode22(did: 0x2C0B, header: dmeHeader),
        byteCount: 1,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .intercoolerC,
        parse: { bytes, _ in OBDFrameParser.bmwOilTempC(fromMode22Bytes: bytes) }
    )

    static let bmwOutsideTemp = VLinkerPIDDefinition(
        id: "bmw.ambient.2F01",
        titleKey: "metric.ambient",
        kind: .mode22(did: 0x2F01, header: dmeHeader),
        byteCount: 1,
        tier: .slow,
        platforms: bmwPlatforms,
        metric: .ambientC,
        parse: { bytes, _ in
            guard let a = bytes.first else { return nil }
            return Double(a) * 0.5 - 40
        }
    )

    static let bmwLowPressureFuel = VLinkerPIDDefinition(
        id: "bmw.lpfp.2B02",
        titleKey: "metric.lowPressureFuel",
        kind: .mode22(did: 0x2B02, header: dmeHeader),
        byteCount: 2,
        tier: .medium,
        platforms: bmwPlatforms,
        metric: .lowPressureFuelBar,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.01
        }
    )

    // MARK: - Battery / alternator (DME may answer; gateway 6F1 for IBS path)

    /// Prefer DME/7DF path first (ECU often shares); gateway `6F1` kept as kind header for retry logic.
    static let bmwAlternatorVoltage = VLinkerPIDDefinition(
        id: "bmw.alternator.2D01",
        titleKey: "metric.alternatorVoltage",
        kind: .mode22(did: 0x2D01, header: dmeHeader),
        byteCount: 2,
        tier: .slow,
        platforms: bmwPlatforms,
        metric: .alternatorVoltage,
        parse: { bytes, _ in
            guard bytes.count >= 2 else { return nil }
            return (Double(bytes[0]) * 256 + Double(bytes[1])) * 0.001
        }
    )

    static let bmwBatterySoc = VLinkerPIDDefinition(
        id: "bmw.batterySoc.2D04",
        titleKey: "metric.batterySoc",
        kind: .mode22(did: 0x2D04, header: dmeHeader),
        byteCount: 1,
        tier: .slow,
        platforms: bmwPlatforms,
        metric: .batterySocPct,
        parse: { bytes, _ in
            guard let a = bytes.first else { return nil }
            return Double(a)
        }
    )

    /// All extended PIDs that require Mode 22 + platform match.
    static let bmwExtended: [VLinkerPIDDefinition] = [
        bmwOilTemp,
        bmwOilTempLegacy4402,
        bmwCoolantMode22,
        bmwBoostActual,
        bmwBoostTarget,
        bmwFuelRail,
        bmwTransmissionOil,
        bmwOilPressure,
        bmwIgnitionAdvance,
        bmwThrottleAngle,
        bmwPedalPosition,
        bmwMaf,
        bmwVanosIntake,
        bmwVanosExhaust,
        bmwRadiatorOutlet,
        bmwIntercooler,
        bmwOutsideTemp,
        bmwLowPressureFuel,
        bmwAlternatorVoltage,
        bmwBatterySoc
    ]

    static let standardMode01Metrics: [(pid: UInt8, tier: VLinkerPollTier, metricNote: String)] = [
        (0x0C, .fast, "rpm"),
        (0x0D, .fast, "speed"),
        (0x05, .medium, "coolant"),
        (0x04, .medium, "engineLoad"),
        (0x11, .medium, "throttle"),
        (0x0B, .medium, "map"),
        (0x10, .medium, "maf"),
        (0x5E, .medium, "fuelRate"),
        (0x5C, .medium, "oilTemp.standard"),
        (0x2F, .slow, "fuelLevel"),
        (0x42, .slow, "voltage"),
        (0x0F, .slow, "intakeAir"),
        (0x33, .rare, "baro"),
        (0x46, .rare, "ambient"),
        (0x06, .rare, "stft1"),
        (0x07, .rare, "ltft1"),
        (0x3C, .rare, "catalyst"),
        (0x31, .rare, "distClear"),
        (0x49, .rare, "pedal"),
        (0x0E, .rare, "timing")
    ]

    static func extendedPIDs(for platform: VehiclePlatform) -> [VLinkerPIDDefinition] {
        guard platform != .universal else { return [] }
        return bmwExtended.filter { $0.platforms.contains(platform) || $0.platforms.contains(.bmwFSeries) }
    }

    static func definition(id: String) -> VLinkerPIDDefinition? {
        bmwExtended.first { $0.id == id }
    }
}
