import Foundation
import SwiftData

@MainActor
final class BatteryGuardian: CareFeature {
    let id = "batteryGuardian"
    let requiredPIDs: Set<UInt8> = [0x42, 0x0C]
    let optionalPIDs: Set<UInt8> = [0x46]

    private struct RestRef { var full: Double; var warn: Double; var deep: Double }
    private static let restRef: [VehicleDiagnosticProfile.BatteryChem: RestRef] = [
        .flooded: RestRef(full: 12.65, warn: 12.35, deep: 12.10),
        .efb: RestRef(full: 12.70, warn: 12.45, deep: 12.20),
        .agm: RestRef(full: 12.85, warn: 12.55, deep: 12.35),
        .lithium: RestRef(full: 13.30, warn: 13.00, deep: 12.80)
    ]
    private static let drainThreshold: [VehicleDiagnosticProfile.BatteryChem: Double] = [
        .flooded: 0.25, .efb: 0.22, .agm: 0.18, .lithium: 0.05
    ]

    private let modelContext: ModelContext
    private var voltageSamples: [(Date, Double)] = []
    private var previousRPM: Double?
    private var lastCrankAt: Date?
    private var restingBuffer: [Double] = []
    private var soakStart: Date?
    private var lastResting: Double?
    private var drainSamples: [Double] = []
    private var chargingLowStreakStart: Date?
    private var overchargeStreakStart: Date?
    private var chargingAnnounced = false
    private var decliningAnnounced = false

    struct TrendEstimate: Sendable {
        var slopeVPerMonth: Double
        var weeksLeft: Int?
        var r2: Double
        var sampleCount: Int
    }

    private(set) var lastTrend: TrendEstimate?
    private(set) var lastAssessment: BatteryAssessment?

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careBatteryGuardian }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let now = context.now
        let profile = context.profile
        let rpm = snapshot.rpm ?? 0
        if !context.canHealthy {
            chargingLowStreakStart = nil
            overchargeStreakStart = nil
        }
        if let v = snapshot.voltage {
            voltageSamples.append((now, v))
            voltageSamples = voltageSamples.filter { now.timeIntervalSince($0.0) <= 30 }
            if rpm < 50 {
                restingBuffer.append(v)
                if restingBuffer.count > 20 { restingBuffer.removeFirst() }
            }
        }

        var cues: [CareCue] = []
        let ref = Self.restRef[profile.batteryChem] ?? Self.restRef[.efb]!
        let soakFloorH: Double = profile.hasStartStop ? 6 : 4

        if let event = BatteryHealthAnalyzer.detectCrank(
            previousRPM: previousRPM,
            currentRPM: snapshot.rpm,
            voltageSamples: voltageSamples,
            ambientC: context.effectiveAmbientC ?? context.ambientC ?? snapshot.ambientC,
            now: now
        ) {
            lastCrankAt = now
            var minVoltage = event.minVoltage
            if profile.fuel == .diesel, profile.hasGlowPlugs {
                minVoltage += 0.4 // ön ısıtma çekişi crank dibini derinleştirir, arıza değil
            }
            let resting = restingBuffer.isEmpty
                ? event.restingVoltage
                : restingBuffer.suffix(5).reduce(0, +) / Double(min(5, restingBuffer.count))
            let record = CrankRecord(
                date: now,
                minVoltage: minVoltage,
                restingVoltage: resting,
                recoveryVoltage: event.recoveryVoltage,
                ambientC: event.ambientC
            )
            modelContext.insert(record)
            try? modelContext.save()

            if let prev = lastResting, let soak = soakStart {
                let soakHours = now.timeIntervalSince(soak) / 3600
                if soakHours >= soakFloorH, soakHours > 12 {
                    let drain = (prev - resting) / (soakHours / 24)
                    drainSamples.append(drain)
                    let threshold = Self.drainThreshold[profile.batteryChem] ?? 0.25
                    if drainSamples.count >= 5,
                       drainSamples.suffix(5).allSatisfy({ $0 > threshold }) {
                        cues.append(CareCue(
                            id: "battery.drain",
                            text: LocalizedCare.string("battery.parasiticDrain"),
                            severity: .coach,
                            localizationKey: "battery.parasiticDrain"
                        ))
                    }
                }
            }
            lastResting = resting
            soakStart = nil

            if resting < ref.deep {
                let soakH = soakStart.map { now.timeIntervalSince($0) / 3600 } ?? 24
                if soakH >= 8 {
                    cues.append(CareCue(
                        id: "battery.deep",
                        text: LocalizedCare.string("battery.parasiticDrain"),
                        severity: .protective,
                        localizationKey: "battery.parasiticDrain"
                    ))
                    modelContext.insert(ProtectionEvent(
                        typeRaw: "lowVoltage",
                        severityRaw: "alarm",
                        value: resting,
                        thresholdUsed: ref.deep
                    ))
                }
            }
        }

        cues.append(contentsOf: evaluateCharging(snapshot: snapshot, context: context))

        if rpm < 50 {
            if soakStart == nil { soakStart = now }
        }

        previousRPM = snapshot.rpm
        refreshTrend(profile: profile)
        if let trend = lastTrend, trend.slopeVPerMonth < -0.15, !decliningAnnounced {
            decliningAnnounced = true
            cues.append(CareCue(
                id: "battery.declining",
                text: LocalizedCare.string("battery.declining"),
                severity: .coach,
                localizationKey: "battery.declining"
            ))
        }
        return cues
    }

    /// §7 — akıllı alternatörlü araçta seyir voltajı kasıtlı düşük tutulur, arıza değildir.
    /// Mild/full hibrit + `dcdcConverter` olan araçta alternatör `rpm` kapısı hiç sağlanmaz;
    /// bu modüller için crank/soak akışı zaten voltaj örneklemesine dayanır, chargingLow atlanır.
    private func evaluateCharging(snapshot: VehicleSnapshot, context: CareContext) -> [CareCue] {
        guard !context.profile.dcdcConverter else { return [] }
        let now = context.now
        let rpm = snapshot.rpm ?? 0
        let normLoad = context.normLoad ?? snapshot.engineLoadPct ?? 0
        var cues: [CareCue] = []

        let lowGateOK: Bool
        if context.profile.smartAlternator {
            lowGateOK = rpm > 1200 && normLoad > 30 && (snapshot.voltage ?? 99) < 12.4
        } else {
            lowGateOK = rpm > 900 && (snapshot.voltage ?? 99) < 13.2
        }
        if lowGateOK {
            if chargingLowStreakStart == nil { chargingLowStreakStart = now }
            let holdS: TimeInterval = context.profile.smartAlternator ? 120 : 60
            if now.timeIntervalSince(chargingLowStreakStart!) >= holdS, !chargingAnnounced {
                chargingAnnounced = true
                cues.append(CareCue(
                    id: "battery.chargingLow",
                    text: LocalizedCare.string("battery.chargingLow.voice"),
                    severity: .protective,
                    localizationKey: "battery.chargingLow.voice"
                ))
            }
        } else {
            chargingLowStreakStart = nil
            chargingAnnounced = false
        }

        let ambient = context.effectiveAmbientC ?? context.ambientC ?? snapshot.ambientC ?? 25
        var limit = 14.7 + clamp((25 - ambient) * 0.02, 0, 0.5)
        if context.profile.batteryChem == .agm { limit += 0.2 }
        if rpm > 900, let v = snapshot.voltage, v > limit + 0.3 {
            if overchargeStreakStart == nil { overchargeStreakStart = now }
            if now.timeIntervalSince(overchargeStreakStart!) >= 60 {
                cues.append(CareCue(
                    id: "battery.overcharge",
                    text: LocalizedCare.string("battery.chargingLow.voice"),
                    severity: .protective,
                    localizationKey: "battery.chargingLow.voice"
                ))
            }
        } else {
            overchargeStreakStart = nil
        }
        return cues
    }

    func refreshTrend(profile: VehicleDiagnosticProfile) {
        let rows = (try? modelContext.fetch(
            FetchDescriptor<CrankRecord>(sortBy: [SortDescriptor(\.date, order: .forward)])
        )) ?? []
        let recent = Array(rows.suffix(20))
        guard recent.count >= 12 else {
            lastTrend = nil
            return
        }
        let points: [(Double, Double)] = recent.enumerated().map { idx, r in
            var v = r.minVoltage
            if let a = r.ambientC {
                if a < -10 { v += 0.7 }
                else if a < 5 { v += 0.4 }
            }
            let months = Double(idx) / 30.0
            return (months, v)
        }
        guard let fit = Self.linearRegression(points), fit.r2 > 0.35 else {
            lastTrend = TrendEstimate(slopeVPerMonth: 0, weeksLeft: nil, r2: 0, sampleCount: recent.count)
            return
        }
        let slopeVPerMonth = fit.slope * 30
        var weeks: Int?
        let floor = (Self.restRef[profile.batteryChem] ?? Self.restRef[.efb]!).deep - 2.5
        if slopeVPerMonth < 0, let last = recent.last {
            let weeksLeft = (last.minVoltage - floor) / abs(slopeVPerMonth) * 4
            if weeksLeft.isFinite, weeksLeft > 0 {
                weeks = Int(weeksLeft.rounded())
            }
        }
        lastTrend = TrendEstimate(slopeVPerMonth: slopeVPerMonth, weeksLeft: weeks, r2: fit.r2, sampleCount: recent.count)
        lastAssessment = BatteryHealthAnalyzer.assess(
            history: recent.map {
                CrankEvent(
                    date: $0.date,
                    minVoltage: $0.minVoltage,
                    restingVoltage: $0.restingVoltage,
                    recoveryVoltage: $0.recoveryVoltage,
                    ambientC: $0.ambientC
                )
            }
        )
    }

    nonisolated static func linearRegression(_ points: [(Double, Double)]) -> (slope: Double, r2: Double)? {
        let n = Double(points.count)
        guard n >= 2 else { return nil }
        let meanX = points.map(\.0).reduce(0, +) / n
        let meanY = points.map(\.1).reduce(0, +) / n
        var num = 0.0, den = 0.0, ssTot = 0.0, ssRes = 0.0
        for p in points {
            let dx = p.0 - meanX
            num += dx * (p.1 - meanY)
            den += dx * dx
        }
        guard den > 0 else { return nil }
        let slope = num / den
        let intercept = meanY - slope * meanX
        for p in points {
            let pred = intercept + slope * p.0
            ssTot += (p.1 - meanY) * (p.1 - meanY)
            ssRes += (p.1 - pred) * (p.1 - pred)
        }
        let r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
        return (slope, r2)
    }

    private func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(max(v, lo), hi) }
}
