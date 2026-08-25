import Foundation

/// Güven etiketi — bir profil alanının nereden geldiğini ve ne kadar güvenilir olduğunu işaretler.
/// `.c` (arketip önseli) alanlar alarm üretmez, sadece öğrenme (`observe`) besler.
enum Confidence: String, Codable, Sendable, Comparable {
    case a, b, c

    private var rank: Int {
        switch self {
        case .a: return 2
        case .b: return 1
        case .c: return 0
        }
    }

    static func < (lhs: Confidence, rhs: Confidence) -> Bool { lhs.rank < rhs.rank }

    /// Bundled `VehicleProfilePack.json` stores A/B/C; Swift raw values are a/b/c.
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        switch raw {
        case "a": self = .a
        case "b": self = .b
        case "c": self = .c
        default:
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unknown confidence '\(raw)'"
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct ProfileField<T: Codable & Sendable>: Codable, Sendable {
    var value: T
    var confidence: Confidence
    var source: String

    init(_ value: T, confidence: Confidence, source: String) {
        self.value = value
        self.confidence = confidence
        self.source = source
    }
}

/// Kaynak §10 arketipleri — VIN/model bulunamazsa OBD sinyallerinden çıkarılır.
enum VehicleArchetype: String, Codable, Sendable, CaseIterable {
    case gasolineNA
    case gasolineTurboDI
    case gasolineTurboEuro
    case dieselDPF
    case dieselHeavy
    case hybridFHEV
    case mildHybrid48V
    case ev

    var displayKey: String { "vehicle.archetype.\(rawValue)" }

    var defaultFuel: FuelType {
        switch self {
        case .dieselDPF, .dieselHeavy: return .diesel
        case .gasolineNA, .gasolineTurboDI, .gasolineTurboEuro, .hybridFHEV, .mildHybrid48V, .ev:
            return .gasoline
        }
    }

    var defaultIsTurbo: Bool {
        switch self {
        case .gasolineNA, .hybridFHEV, .ev: return false
        case .gasolineTurboDI, .gasolineTurboEuro, .dieselDPF, .dieselHeavy, .mildHybrid48V:
            return true
        }
    }
}

struct VehicleDiagnosticProfile: Codable, Sendable {
    // Kimlik
    var id: String
    var make: String
    var model: String
    var modelYear: Int
    var archetype: VehicleArchetype
    var overallConfidence: Confidence

    // Motor
    var fuel: FuelType
    var aspiration: Aspiration
    var injection: Injection
    var displacementL: Double
    var redlineRpm: Double
    var idleRpmNominal: Double

    enum Aspiration: String, Codable, Sendable { case na, turbo, twinTurbo, supercharged }
    enum Injection: String, Codable, Sendable { case port, direct, dual }

    // Soğutma
    var thermostatOpenC: ProfileField<Double>
    var mapControlledThermostat: ProfileField<Bool>
    var fanOnC: ProfileField<Double>
    var fanType: FanType
    var capPressureBar: ProfileField<Double>
    var hasAuxElectricCoolantPump: ProfileField<Bool>

    enum FanType: String, Codable, Sendable { case electric, viscousClutch, hydraulic }

    // Turbo
    var turboWaterCooled: Bool
    var maxBoostKpa: Double

    // Yağ
    enum OilGrade: String, Codable, Sendable { case w0_20, w5_30, w5_40 }
    var oilGrade: OilGrade
    var hasOilTempPid: Bool

    // Egzoz sonrası / ölçüm
    var hasDPF: Bool
    var hasGPF: Bool
    var hasEGR: Bool
    var hasSCR: Bool
    enum O2Type: String, Codable, Sendable { case narrowband, wideband, none }
    var o2Type: O2Type
    enum AirMeter: String, Codable, Sendable { case maf, speedDensity, both }
    var airMeter: AirMeter

    // Elektrik
    enum BatteryChem: String, Codable, Sendable { case flooded, efb, agm, lithium }
    var batteryChem: BatteryChem
    var batteryAh: Double
    var smartAlternator: Bool
    var hasStartStop: Bool
    var hasGlowPlugs: Bool
    var dcdcConverter: Bool

    // Ortam
    var altitudeM: Double
    var ethanolBlend: Double

    // Taşıma katmanı
    enum OBDProtocol: String, Codable, Sendable { case canFast, canSlow, iso14230, j1850 }
    var obdProtocol: OBDProtocol
    var supportsMode06: Bool
    var supportsMode0A: Bool
    var supportedPIDs: Set<UInt8>
    /// BMW Mode 22 only when this profile actually ships those PIDs.
    var pidPack: VehiclePlatform

    // Güç aktarma sınıfı davranış bayrakları (§3)
    var flags: Set<String>
}

extension VehicleDiagnosticProfile {
    /// Normal çalışma tavanı — harita kontrollü termostatta kısmi yükte 100–110°C beklenir.
    var coolantNormalTopC: Double {
        mapControlledThermostat.value ? 108 : thermostatOpenC.value + 13
    }
    var coolantWatchC: Double { coolantNormalTopC + 3 }
    var coolantAlarmC: Double { min(coolantNormalTopC + 8, boilingCeilingC - 6) }
    var coolantCriticalC: Double { min(coolantNormalTopC + 14, boilingCeilingC) }

    /// %50 glikol karışımı + kapak basıncına göre kaynama tavanı (1.1→121, 1.4→125, 2.0→132).
    var boilingCeilingC: Double { 108 + capPressureBar.value * 12 }

    var effectiveFanOnC: Double { fanOnC.value > 0 ? fanOnC.value : thermostatOpenC.value + 12 }

    var warmupTargetC: Double { thermostatOpenC.value - 3 }
    var oilWarmC: Double { oilGrade == .w0_20 ? 75 : 80 }

    var isFullHybrid: Bool { archetype == .hybridFHEV }
    var isMildHybrid48V: Bool { archetype == .mildHybrid48V }
    var isEV: Bool { archetype == .ev }
    var hasNoICE: Bool { flags.contains("noICE") || archetype == .ev }
}

/// §12 — profil çözülemediğinde arketip bazlı varsayılanlar.
enum VehicleArchetypeDefaults {
    static func profile(for archetype: VehicleArchetype, fuel: FuelType, isTurbo: Bool) -> VehicleDiagnosticProfile {
        switch archetype {
        case .gasolineNA:
            return make(
                id: "archetype.gasolineNA", archetype: .gasolineNA, fuel: .gasoline,
                aspiration: .na, thermostatC: 87, mapControlled: false,
                fanOnC: 99, capBar: 1.1, batteryChem: .flooded, smartAlt: false,
                trimEnabled: true, coldCapPct: 0.35
            )
        case .gasolineTurboDI:
            return make(
                id: "archetype.gasolineTurboDI", archetype: .gasolineTurboDI, fuel: .gasoline,
                aspiration: .turbo, thermostatC: 90, mapControlled: false,
                fanOnC: 102, capBar: 1.4, batteryChem: .efb, smartAlt: true,
                trimEnabled: true, coldCapPct: 0.35, turboWaterCooled: true
            )
        case .gasolineTurboEuro:
            return make(
                id: "archetype.gasolineTurboEuro", archetype: .gasolineTurboEuro, fuel: .gasoline,
                aspiration: .turbo, thermostatC: 95, mapControlled: true,
                fanOnC: 104, capBar: 2.0, batteryChem: .agm, smartAlt: true,
                trimEnabled: true, coldCapPct: 0.35, turboWaterCooled: true
            )
        case .dieselDPF:
            return make(
                id: "archetype.dieselDPF", archetype: .dieselDPF, fuel: .diesel,
                aspiration: .turbo, thermostatC: 82, mapControlled: false,
                fanOnC: 95, capBar: 1.4, batteryChem: .efb, smartAlt: true,
                trimEnabled: false, coldCapPct: 0.40, turboWaterCooled: true,
                hasDPF: true, hasEGR: true, o2Type: .none, glowPlugs: true
            )
        case .dieselHeavy:
            return make(
                id: "archetype.dieselHeavy", archetype: .dieselHeavy, fuel: .diesel,
                aspiration: .turbo, thermostatC: 80, mapControlled: false,
                fanOnC: 93, capBar: 1.4, batteryChem: .flooded, smartAlt: false,
                trimEnabled: false, coldCapPct: 0.40, turboWaterCooled: false,
                hasDPF: true, hasEGR: true, o2Type: .none, glowPlugs: true
            )
        case .hybridFHEV:
            return make(
                id: "archetype.hybridFHEV", archetype: .hybridFHEV, fuel: .gasoline,
                aspiration: .na, thermostatC: 82, mapControlled: false,
                fanOnC: 96, capBar: 1.1, batteryChem: .agm, smartAlt: false,
                trimEnabled: true, coldCapPct: 0, dcdc: true,
                flags: ["iceIntermittent", "noThermalShockModule", "noIdleModule"]
            )
        case .mildHybrid48V:
            return make(
                id: "archetype.mildHybrid48V", archetype: .mildHybrid48V, fuel: fuel,
                aspiration: .turbo, thermostatC: 90, mapControlled: true,
                fanOnC: 102, capBar: 1.4, batteryChem: .agm, smartAlt: true,
                trimEnabled: true, coldCapPct: 0.35, turboWaterCooled: true,
                hasAuxPump: true, flags: ["startStopFrequent"]
            )
        case .ev:
            return make(
                id: "archetype.ev", archetype: .ev, fuel: .gasoline,
                aspiration: .na, thermostatC: 0, mapControlled: false,
                fanOnC: 38, capBar: 1.2, batteryChem: .lithium, smartAlt: false,
                trimEnabled: false, coldCapPct: 0, dcdc: true,
                flags: ["noICE"]
            )
        }
    }

    private static func make(
        id: String,
        archetype: VehicleArchetype,
        fuel: FuelType,
        aspiration: VehicleDiagnosticProfile.Aspiration,
        thermostatC: Double,
        mapControlled: Bool,
        fanOnC: Double,
        capBar: Double,
        batteryChem: VehicleDiagnosticProfile.BatteryChem,
        smartAlt: Bool,
        trimEnabled: Bool,
        coldCapPct: Double,
        turboWaterCooled: Bool = false,
        hasAuxPump: Bool = false,
        hasDPF: Bool = false,
        hasEGR: Bool = false,
        o2Type: VehicleDiagnosticProfile.O2Type = .wideband,
        glowPlugs: Bool = false,
        dcdc: Bool = false,
        flags: Set<String> = []
    ) -> VehicleDiagnosticProfile {
        var f = flags
        if !trimEnabled { f.insert("fuelTrimDisabled") }
        return VehicleDiagnosticProfile(
            id: id, make: "generic", model: archetype.rawValue, modelYear: 0,
            archetype: archetype, overallConfidence: .c,
            fuel: fuel, aspiration: aspiration, injection: .direct,
            displacementL: 1.6, redlineRpm: fuel == .diesel ? 4500 : 7000, idleRpmNominal: 800,
            thermostatOpenC: ProfileField(thermostatC, confidence: .c, source: "archetype"),
            mapControlledThermostat: ProfileField(mapControlled, confidence: .c, source: "archetype"),
            fanOnC: ProfileField(fanOnC, confidence: .c, source: "archetype"),
            fanType: .electric,
            capPressureBar: ProfileField(capBar, confidence: .c, source: "archetype"),
            hasAuxElectricCoolantPump: ProfileField(hasAuxPump, confidence: .c, source: "archetype"),
            turboWaterCooled: turboWaterCooled, maxBoostKpa: 180,
            oilGrade: .w5_30, hasOilTempPid: false,
            hasDPF: hasDPF, hasGPF: false, hasEGR: hasEGR, hasSCR: false,
            o2Type: o2Type, airMeter: .maf,
            batteryChem: batteryChem, batteryAh: 60, smartAlternator: smartAlt,
            hasStartStop: smartAlt, hasGlowPlugs: glowPlugs, dcdcConverter: dcdc,
            altitudeM: 0, ethanolBlend: 0,
            obdProtocol: .canFast, supportsMode06: true, supportsMode0A: true,
            supportedPIDs: [], pidPack: .universal, flags: f
        )
    }
}
