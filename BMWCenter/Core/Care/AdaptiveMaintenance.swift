import Foundation
import SwiftData

@MainActor
final class AdaptiveMaintenance: CareFeature {
    let id = "adaptiveMaint"
    let requiredPIDs: Set<UInt8> = []
    let optionalPIDs: Set<UInt8> = [0x10]

    private let baseline: BaselineLearner
    private let modelContext: ModelContext
    private var highRevS: Double = 0
    private var idleS: Double = 0
    private var thermalStressMin: Double = 0
    private var sawHotOil = false
    private var tripDistance: Double = 0
    private var lastSampleAt: Date?
    private(set) var lastSeverity: Double = 1.0
    var airflowEnabled = true

    init(baseline: BaselineLearner, modelContext: ModelContext) {
        self.baseline = baseline
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careAdaptiveIntervals }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let now = context.now
        let dt: Double
        if let last = lastSampleAt {
            dt = min(2, now.timeIntervalSince(last))
        } else {
            dt = 1
        }
        lastSampleAt = now

        let rpm = snapshot.rpm ?? 0
        let speed = snapshot.speedKmh ?? 0
        tripDistance = context.tripDistanceKm
        if rpm > 4000 { highRevS += dt }
        if speed < 2, rpm > 300 { idleS += dt }
        if let coolant = snapshot.coolantC, coolant > 105 {
            thermalStressMin += dt / 60
        }
        if let oil = context.oilTempC, oil >= 80 { sawHotOil = true }

        // Airflow watch
        var cues: [CareCue] = []
        if let maf = snapshot.mafGs,
           let load = snapshot.engineLoadPct {
            let bucket = CareBucket.composite(
                ambient: context.ambientC,
                load: load,
                speed: speed
            )
            // Use rpm×load proxy key
            let key = "maf.flow"
            baseline.observe(
                key: key,
                value: maf,
                bucketKey: bucket,
                minSamples: 300,
                range: 0...300,
                now: now
            )
            if let snap = baseline.snapshot(key: key, bucketKey: bucket), snap.isMature,
               maf < snap.p50 * 0.92 {
                cues.append(CareCue(
                    id: "airflow.low",
                    text: LocalizedCare.string("airflow.low"),
                    severity: .coach,
                    localizationKey: "airflow.low"
                ))
            }
        }
        return airflowEnabled ? cues : []
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] {
        let severity = Self.severityFactor(
            oilReached80: sawHotOil,
            distanceKm: trip.distanceKm,
            highRevShare: trip.durationS > 0 ? highRevS / trip.durationS : 0,
            idleShare: trip.durationS > 0 ? idleS / trip.durationS : 0,
            thermalStressMin: thermalStressMin,
            avgSpeedKmh: trip.avgSpeedKmh
        )
        lastSeverity = severity
        applyLedger(distanceKm: trip.distanceKm, severity: severity)
        resetTrip()
        return []
    }

    nonisolated static func severityFactor(
        oilReached80: Bool,
        distanceKm: Double,
        highRevShare: Double,
        idleShare: Double,
        thermalStressMin: Double,
        avgSpeedKmh: Double
    ) -> Double {
        var s = 1.0
        if !oilReached80 { s += 0.55 }
        if distanceKm < 4 { s += 0.55 }
        else if distanceKm < 8 { s += 0.35 }
        s += min(highRevShare, 1) * 0.5
        s += min(idleShare, 1) * 0.3
        s += min(thermalStressMin * 0.04, 0.4)
        if avgSpeedKmh < 25 { s += 0.1 }
        return min(max(s, 1.0), 2.4)
    }

    /// Remaining distance never exceeds OEM interval (cannot extend).
    nonisolated static func remainingKm(intervalKm: Double, effectiveKm: Double, actualKm: Double) -> Double {
        let byEffective = intervalKm - effectiveKm
        let byActual = intervalKm - actualKm
        // Adaptive can only shorten → remaining is the more conservative (smaller) of the two
        return min(byEffective, byActual)
    }

    private func applyLedger(distanceKm: Double, severity: Double) {
        let keys = ["oil", "oilFilter", "airFilter", "spark", "transmission"]
        for key in keys {
            let ledger = fetchOrCreate(key)
            ledger.actualKm += distanceKm
            ledger.effectiveKm += distanceKm * severity
            let n = max(1, ledger.actualKm / max(distanceKm, 0.1))
            ledger.severityAvg = (ledger.severityAvg * (n - 1) + severity) / n
        }
        try? modelContext.save()
    }

    func fetchOrCreate(_ key: String) -> MaintenanceLedger {
        let all = (try? modelContext.fetch(FetchDescriptor<MaintenanceLedger>())) ?? []
        if let existing = all.first(where: { $0.itemKey == key }) { return existing }
        let row = MaintenanceLedger(itemKey: key)
        modelContext.insert(row)
        return row
    }

    private func resetTrip() {
        highRevS = 0
        idleS = 0
        thermalStressMin = 0
        sawHotOil = false
        tripDistance = 0
        lastSampleAt = nil
    }
}
