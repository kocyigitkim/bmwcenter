import Foundation
import SwiftData

enum TripCategory: String, CaseIterable, Sendable {
    case personal, business, other
}

@Model
final class Trip {
    var id: UUID
    var startedAt: Date
    var endedAt: Date?
    var distanceKm: Double
    var durationS: Double
    var movingDurationS: Double
    var idleDurationS: Double
    var fuelUsedL: Double
    var idleFuelL: Double
    var avgSpeedKmh: Double
    var maxSpeedKmh: Double
    var maxRpm: Double
    var avgL100: Double
    var startFuelPct: Double?
    var endFuelPct: Double?
    var startLatitude: Double?
    var startLongitude: Double?
    var endLatitude: Double?
    var endLongitude: Double?
    var startPlaceName: String?
    var endPlaceName: String?
    var routeData: Data?
    var isManual: Bool
    var categoryRaw: String
    var dataSource: String
    var scoreTotal: Double?
    var scoreBreakdownData: Data?
    var note: String?
    @Relationship(deleteRule: .cascade, inverse: \TripSample.trip)
    var samples: [TripSample]?
    @Relationship(deleteRule: .cascade, inverse: \DrivingEvent.trip)
    var events: [DrivingEvent]?

    var category: TripCategory {
        get { TripCategory(rawValue: categoryRaw) ?? .personal }
        set { categoryRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        startedAt: Date = .now,
        isManual: Bool = false,
        dataSource: String = "obd",
        category: TripCategory = .personal
    ) {
        self.id = id
        self.startedAt = startedAt
        self.endedAt = nil
        self.distanceKm = 0
        self.durationS = 0
        self.movingDurationS = 0
        self.idleDurationS = 0
        self.fuelUsedL = 0
        self.idleFuelL = 0
        self.avgSpeedKmh = 0
        self.maxSpeedKmh = 0
        self.maxRpm = 0
        self.avgL100 = 0
        self.isManual = isManual
        self.categoryRaw = category.rawValue
        self.dataSource = dataSource
        self.samples = []
        self.events = []
    }
}

@Model
final class TripSample {
    var t: Date
    var speedKmh: Double
    var rpm: Double
    var fuelRateLh: Double
    var coolantC: Double
    var throttlePct: Double
    var boostKpa: Double
    var trip: Trip?

    init(
        t: Date = .now,
        speedKmh: Double = 0,
        rpm: Double = 0,
        fuelRateLh: Double = 0,
        coolantC: Double = 0,
        throttlePct: Double = 0,
        boostKpa: Double = 0
    ) {
        self.t = t
        self.speedKmh = speedKmh
        self.rpm = rpm
        self.fuelRateLh = fuelRateLh
        self.coolantC = coolantC
        self.throttlePct = throttlePct
        self.boostKpa = boostKpa
    }
}

@Model
final class DrivingEvent {
    var typeRaw: String
    var t: Date
    var severityRaw: String
    var speedKmh: Double
    var magnitude: Double
    var latitude: Double?
    var longitude: Double?
    var trip: Trip?

    init(
        typeRaw: String,
        t: Date = .now,
        severityRaw: String = "normal",
        speedKmh: Double = 0,
        magnitude: Double = 0,
        latitude: Double? = nil,
        longitude: Double? = nil
    ) {
        self.typeRaw = typeRaw
        self.t = t
        self.severityRaw = severityRaw
        self.speedKmh = speedKmh
        self.magnitude = magnitude
        self.latitude = latitude
        self.longitude = longitude
    }
}

@Model
final class RefuelEntry {
    var id: UUID
    var date: Date
    var liters: Double
    var pricePerLiter: Double
    var totalCost: Double
    var odometerKm: Double?
    var isFullTank: Bool
    var stationName: String?
    var note: String?

    init(
        id: UUID = UUID(),
        date: Date = .now,
        liters: Double,
        pricePerLiter: Double,
        odometerKm: Double? = nil,
        isFullTank: Bool = false,
        stationName: String? = nil,
        note: String? = nil
    ) {
        self.id = id
        self.date = date
        self.liters = liters
        self.pricePerLiter = pricePerLiter
        self.totalCost = liters * pricePerLiter
        self.odometerKm = odometerKm
        self.isFullTank = isFullTank
        self.stationName = stationName
        self.note = note
    }
}

@Model
final class FuelPricePoint {
    var date: Date
    var pricePerLiter: Double
    var currencyCode: String

    init(date: Date = .now, pricePerLiter: Double, currencyCode: String = "TRY") {
        self.date = date
        self.pricePerLiter = pricePerLiter
        self.currencyCode = currencyCode
    }
}

@Model
final class CalibrationSample {
    var date: Date
    var measuredL: Double
    var calculatedL: Double
    var distanceKm: Double
    var rawFactor: Double
    var accepted: Bool

    init(
        date: Date = .now,
        measuredL: Double,
        calculatedL: Double,
        distanceKm: Double,
        rawFactor: Double,
        accepted: Bool
    ) {
        self.date = date
        self.measuredL = measuredL
        self.calculatedL = calculatedL
        self.distanceKm = distanceKm
        self.rawFactor = rawFactor
        self.accepted = accepted
    }
}

@Model
final class VehicleProfile {
    var id: UUID
    var name: String
    var fuelTypeRaw: String
    var tankCapacityL: Double
    var displacementL: Double
    var volumetricEfficiency: Double
    var isTurbo: Bool
    var fuelCalibrationFactor: Double
    var speedCalibrationFactor: Double
    var odometerKm: Double
    var odometerOffsetKm: Double
    var vin: String?
    var isActive: Bool

    var fuelType: FuelType {
        get { FuelType(rawValue: fuelTypeRaw) ?? .gasoline }
        set { fuelTypeRaw = newValue.rawValue }
    }

    init(
        id: UUID = UUID(),
        name: String = "BMW",
        fuelTypeRaw: String = FuelType.gasoline.rawValue,
        tankCapacityL: Double = 60.0,
        displacementL: Double = 2.0,
        volumetricEfficiency: Double = 0.85,
        isTurbo: Bool = true,
        fuelCalibrationFactor: Double = 1.0,
        speedCalibrationFactor: Double = 1.0,
        odometerKm: Double = 0,
        odometerOffsetKm: Double = 0,
        vin: String? = nil,
        isActive: Bool = true
    ) {
        self.id = id
        self.name = name
        self.fuelTypeRaw = fuelTypeRaw
        self.tankCapacityL = tankCapacityL
        self.displacementL = displacementL
        self.volumetricEfficiency = volumetricEfficiency
        self.isTurbo = isTurbo
        self.fuelCalibrationFactor = fuelCalibrationFactor
        self.speedCalibrationFactor = speedCalibrationFactor
        self.odometerKm = odometerKm
        self.odometerOffsetKm = odometerOffsetKm
        self.vin = vin
        self.isActive = isActive
    }
}

@Model
final class MaintenanceItem {
    var id: UUID
    var titleKey: String
    var customTitle: String?
    var intervalKm: Double?
    var intervalMonths: Int?
    var lastDoneKm: Double?
    var lastDoneDate: Date?
    var lastCost: Double?
    var note: String?
    var isEnabled: Bool

    init(
        id: UUID = UUID(),
        titleKey: String,
        customTitle: String? = nil,
        intervalKm: Double? = nil,
        intervalMonths: Int? = nil,
        lastDoneKm: Double? = nil,
        lastDoneDate: Date? = nil,
        lastCost: Double? = nil,
        note: String? = nil,
        isEnabled: Bool = true
    ) {
        self.id = id
        self.titleKey = titleKey
        self.customTitle = customTitle
        self.intervalKm = intervalKm
        self.intervalMonths = intervalMonths
        self.lastDoneKm = lastDoneKm
        self.lastDoneDate = lastDoneDate
        self.lastCost = lastCost
        self.note = note
        self.isEnabled = isEnabled
    }
}

@Model
final class DTCRecord {
    var code: String
    var seenAt: Date
    var clearedAt: Date?
    var statusRaw: String
    var freezeFrameData: Data?

    init(
        code: String,
        seenAt: Date = .now,
        clearedAt: Date? = nil,
        statusRaw: String = "stored",
        freezeFrameData: Data? = nil
    ) {
        self.code = code
        self.seenAt = seenAt
        self.clearedAt = clearedAt
        self.statusRaw = statusRaw
        self.freezeFrameData = freezeFrameData
    }
}

@Model
final class CrankRecord {
    var date: Date
    var minVoltage: Double
    var restingVoltage: Double
    var recoveryVoltage: Double
    var ambientC: Double?

    init(
        date: Date = .now,
        minVoltage: Double,
        restingVoltage: Double,
        recoveryVoltage: Double,
        ambientC: Double? = nil
    ) {
        self.date = date
        self.minVoltage = minVoltage
        self.restingVoltage = restingVoltage
        self.recoveryVoltage = recoveryVoltage
        self.ambientC = ambientC
    }
}

@Model
final class AccelRecord {
    var date: Date
    var t0to100: Double?
    var t0to60: Double?
    var t80to120: Double?
    var sampleRateHz: Double

    init(
        date: Date = .now,
        t0to100: Double? = nil,
        t0to60: Double? = nil,
        t80to120: Double? = nil,
        sampleRateHz: Double = 0
    ) {
        self.date = date
        self.t0to100 = t0to100
        self.t0to60 = t0to60
        self.t80to120 = t80to120
        self.sampleRateHz = sampleRateHz
    }
}

@Model
final class BaselineMetric {
    var key: String
    var bucketKey: String
    var count: Int
    var mean: Double
    var m2: Double
    var p50: Double
    var p95: Double
    var lastUpdated: Date
    var isMature: Bool
    var histogramData: Data?

    init(
        key: String,
        bucketKey: String = "",
        count: Int = 0,
        mean: Double = 0,
        m2: Double = 0,
        p50: Double = 0,
        p95: Double = 0,
        lastUpdated: Date = .now,
        isMature: Bool = false,
        histogramData: Data? = nil
    ) {
        self.key = key
        self.bucketKey = bucketKey
        self.count = count
        self.mean = mean
        self.m2 = m2
        self.p50 = p50
        self.p95 = p95
        self.lastUpdated = lastUpdated
        self.isMature = isMature
        self.histogramData = histogramData
    }
}

@Model
final class ProtectionEvent {
    var id: UUID
    var typeRaw: String
    var severityRaw: String
    var t: Date
    var value: Double
    var thresholdUsed: Double
    var contextData: Data?
    var acknowledged: Bool
    var trip: Trip?

    init(
        id: UUID = UUID(),
        typeRaw: String,
        severityRaw: String,
        t: Date = .now,
        value: Double = 0,
        thresholdUsed: Double = 0,
        contextData: Data? = nil,
        acknowledged: Bool = false,
        trip: Trip? = nil
    ) {
        self.id = id
        self.typeRaw = typeRaw
        self.severityRaw = severityRaw
        self.t = t
        self.value = value
        self.thresholdUsed = thresholdUsed
        self.contextData = contextData
        self.acknowledged = acknowledged
        self.trip = trip
    }
}

@Model
final class ChallengeProgress {
    var id: UUID
    var challengeKey: String
    var weekStart: Date
    var target: Double
    var current: Double
    var difficultyRaw: String
    var points: Int
    var completedAt: Date?

    init(
        id: UUID = UUID(),
        challengeKey: String,
        weekStart: Date,
        target: Double,
        current: Double = 0,
        difficultyRaw: String,
        points: Int,
        completedAt: Date? = nil
    ) {
        self.id = id
        self.challengeKey = challengeKey
        self.weekStart = weekStart
        self.target = target
        self.current = current
        self.difficultyRaw = difficultyRaw
        self.points = points
        self.completedAt = completedAt
    }
}

@Model
final class BadgeAward {
    var badgeKey: String
    var awardedAt: Date
    var progressSnapshot: Double

    init(badgeKey: String, awardedAt: Date = .now, progressSnapshot: Double = 1) {
        self.badgeKey = badgeKey
        self.awardedAt = awardedAt
        self.progressSnapshot = progressSnapshot
    }
}

@Model
final class StreakState {
    var currentDays: Int
    var bestDays: Int
    var shieldsAvailable: Int
    var lastGoodDay: Date?
    var totalPoints: Int

    init(
        currentDays: Int = 0,
        bestDays: Int = 0,
        shieldsAvailable: Int = 1,
        lastGoodDay: Date? = nil,
        totalPoints: Int = 0
    ) {
        self.currentDays = currentDays
        self.bestDays = bestDays
        self.shieldsAvailable = shieldsAvailable
        self.lastGoodDay = lastGoodDay
        self.totalPoints = totalPoints
    }
}

@Model
final class MaintenanceLedger {
    var itemKey: String
    var effectiveKm: Double
    var actualKm: Double
    var lastDoneAt: Date?
    var lastDoneKm: Double?
    var severityAvg: Double

    init(
        itemKey: String,
        effectiveKm: Double = 0,
        actualKm: Double = 0,
        lastDoneAt: Date? = nil,
        lastDoneKm: Double? = nil,
        severityAvg: Double = 1.0
    ) {
        self.itemKey = itemKey
        self.effectiveKm = effectiveKm
        self.actualKm = actualKm
        self.lastDoneAt = lastDoneAt
        self.lastDoneKm = lastDoneKm
        self.severityAvg = severityAvg
    }
}

@Model
final class ThermalEvent {
    var t: Date
    var tli: Double
    var recommendedIdleS: Double
    var actualIdleS: Double
    var compliant: Bool

    init(
        t: Date = .now,
        tli: Double,
        recommendedIdleS: Double,
        actualIdleS: Double = 0,
        compliant: Bool = false
    ) {
        self.t = t
        self.tli = tli
        self.recommendedIdleS = recommendedIdleS
        self.actualIdleS = actualIdleS
        self.compliant = compliant
    }
}

struct DrivingSummary: Sendable, Equatable {
    var tripCount: Int = 0
    var distanceKm: Double = 0
    var durationS: Double = 0
    var fuelUsedL: Double = 0
    var idleFuelL: Double = 0
    var avgL100: Double = 0
    var bestL100: Double = 0
    var worstL100: Double = 0
    var maxSpeedKmh: Double = 0
    var estimatedCost: Double = 0
    var avgScore: Double?
    var eventCounts: [String: Int] = [:]

    init() {}

    init(trips: [Trip], pricePerLiter: Double) {
        tripCount = trips.count
        distanceKm = trips.reduce(0) { $0 + $1.distanceKm }
        durationS = trips.reduce(0) { $0 + $1.durationS }
        fuelUsedL = trips.reduce(0) { $0 + $1.fuelUsedL }
        idleFuelL = trips.reduce(0) { $0 + $1.idleFuelL }
        maxSpeedKmh = trips.map(\.maxSpeedKmh).max() ?? 0
        estimatedCost = fuelUsedL * pricePerLiter
        let valid = trips.map(\.avgL100).filter { FuelCalculator.isValidAvgL100($0) }
        if distanceKm > 0.1, fuelUsedL > 0 {
            let v = fuelUsedL / distanceKm * 100
            avgL100 = FuelCalculator.isValidAvgL100(v) ? v : 0
        }
        bestL100 = valid.min() ?? 0
        worstL100 = valid.max() ?? 0
        let scores = trips.compactMap(\.scoreTotal)
        avgScore = scores.isEmpty ? nil : scores.reduce(0, +) / Double(scores.count)
        var counts: [String: Int] = [:]
        for trip in trips {
            for event in trip.events ?? [] {
                counts[event.typeRaw, default: 0] += 1
            }
        }
        eventCounts = counts
    }
}
