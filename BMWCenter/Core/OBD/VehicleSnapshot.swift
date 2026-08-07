import Foundation

struct VehicleSnapshot: Sendable, Equatable {
    var timestamp: Date = .now
    // basic
    var speedKmh: Double?
    var rpm: Double?
    var coolantC: Double?
    var fuelLevelPct: Double?
    var mafGs: Double?
    var mapKpa: Double?
    var intakeAirC: Double?
    var throttlePct: Double?
    var engineLoadPct: Double?
    var voltage: Double?
    var engineFuelRateLh: Double?
    var runtimeS: Double?
    // extended
    var oilTempC: Double?
    /// Automatic gearbox oil temperature (°C), BMW EGS Mode 22 DID 1E01.
    var transmissionOilTempC: Double?
    /// Engine oil pressure in bar (gauge), from BMW Mode 22 when available.
    var oilPressureBar: Double?
    /// BMW commanded boost setpoint (kPa), Mode 22 DID 2C11.
    var boostSetpointKpa: Double?
    /// BMW actual boost / charge pressure (kPa), Mode 22 DID 2C10.
    var boostActualKpa: Double?
    /// HPFP rail pressure in bar, Mode 22 DID 2B0D.
    var fuelRailBar: Double?
    /// Radiator outlet (°C), DID D3B2.
    var radiatorOutletC: Double?
    /// Intercooler air (°C), DID 2C0B.
    var intercoolerC: Double?
    /// BMW Mode 22 MAF in kg/h (DID 2C20).
    var mafKgh: Double?
    /// VANOS intake / exhaust cam (°), DID 2C30 / 2C31.
    var vanosIntakeDeg: Double?
    var vanosExhaustDeg: Double?
    /// Low-pressure fuel pump (bar), DID 2B02.
    var lowPressureFuelBar: Double?
    /// Alternator voltage (V), DID 2D01.
    var alternatorVoltage: Double?
    /// Battery state of charge (%), DID 2D04.
    var batterySocPct: Double?
    var baroKpa: Double?
    var ambientC: Double?
    var stftBank1: Double?
    var ltftBank1: Double?
    var stftBank2: Double?
    var ltftBank2: Double?
    var catalystC: Double?
    var fuelRailKpa: Double?
    var pedalPct: Double?
    var timingAdvance: Double?
    var distanceSinceClearKm: Double?
    var distanceWithMILKm: Double?

    var isEngineRunning: Bool { (rpm ?? 0) > 300 }
    var isStale: Bool { Date.now.timeIntervalSince(timestamp) > 3.0 }

    /// Turbo boost (relative). Prefers BMW Mode 22 charge pressure; else MAP − baro.
    var boostKpa: Double? {
        if let absolute = boostActualKpa {
            let baro = baroKpa ?? 101.325
            return absolute - baro
        }
        guard let m = mapKpa, let b = baroKpa else { return nil }
        return m - b
    }

    var boostBar: Double? { boostKpa.map { $0 / 100.0 } }

    /// Absolute charge pressure from BMW DID 2C10 (bar), when present.
    var boostActualBar: Double? { boostActualKpa.map { $0 / 100.0 } }
}

struct DTC: Sendable, Equatable, Identifiable, Hashable {
    enum Status: String, Sendable {
        case stored, pending, permanent
    }

    var id: String { code }
    let code: String
    var status: Status
    var descriptionKey: String?
    /// Short plain-language meaning from DTCCatalog (localized).
    var summary: String?
    var severity: String?
    var firstSeen: Date

    init(
        code: String,
        status: Status = .stored,
        descriptionKey: String? = nil,
        summary: String? = nil,
        severity: String? = nil,
        firstSeen: Date = .now
    ) {
        self.code = code
        self.status = status
        self.descriptionKey = descriptionKey
        self.summary = summary
        self.severity = severity
        self.firstSeen = firstSeen
    }
}
