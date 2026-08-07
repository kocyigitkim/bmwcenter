import Foundation
import SwiftData

@MainActor
final class BatteryGuardian: CareFeature {
    let id = "batteryGuardian"
    let requiredPIDs: Set<UInt8> = [0x42, 0x0C]
    let optionalPIDs: Set<UInt8> = [0x46]

    private let modelContext: ModelContext
    private var voltageSamples: [(Date, Double)] = []
    private var previousRPM: Double?
    private var lastCrankAt: Date?
    private var restingBuffer: [Double] = []
    private var soakStart: Date?
    private var lastResting: Double?
    private var drainSamples: [Double] = []
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
        let rpm = snapshot.rpm ?? 0
        if let v = snapshot.voltage {
            // Approximate dense sampling from 1 Hz stream; store for crank window
            voltageSamples.append((now, v))
            voltageSamples = voltageSamples.filter { now.timeIntervalSince($0.0) <= 30 }
            if rpm < 50 {
                restingBuffer.append(v)
                if restingBuffer.count > 20 { restingBuffer.removeFirst() }
            }
        }

        var cues: [CareCue] = []

        if let event = BatteryHealthAnalyzer.detectCrank(
            previousRPM: previousRPM,
            currentRPM: snapshot.rpm,
            voltageSamples: voltageSamples,
            ambientC: context.ambientC ?? snapshot.ambientC,
            now: now
        ) {
            lastCrankAt = now
            let resting = restingBuffer.isEmpty
                ? event.restingVoltage
                : restingBuffer.suffix(5).reduce(0, +) / Double(min(5, restingBuffer.count))
            let record = CrankRecord(
                date: now,
                minVoltage: event.minVoltage,
                restingVoltage: resting,
                recoveryVoltage: event.recoveryVoltage,
                ambientC: event.ambientC
            )
            modelContext.insert(record)
            try? modelContext.save()

            if let prev = lastResting, let soak = soakStart {
                let soakHours = now.timeIntervalSince(soak) / 3600
                if soakHours > 12 {
                    let drain = (prev - resting) / (soakHours / 24)
                    drainSamples.append(drain)
                    if drainSamples.count >= 3,
                       drainSamples.suffix(3).allSatisfy({ $0 > 0.25 }) {
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

            if resting < 12.2 {
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
                        thresholdUsed: 12.2
                    ))
                }
            }
        }

        if rpm > 900, let v = snapshot.voltage, v < 13.2, !chargingAnnounced {
            chargingAnnounced = true
            cues.append(CareCue(
                id: "battery.chargingLow",
                text: LocalizedCare.string("battery.chargingLow.voice"),
                severity: .protective,
                localizationKey: "battery.chargingLow.voice"
            ))
        }
        if rpm > 900, let v = snapshot.voltage, v > 15.0 {
            cues.append(CareCue(
                id: "battery.overcharge",
                text: LocalizedCare.string("battery.chargingLow.voice"),
                severity: .protective,
                localizationKey: "battery.chargingLow.voice"
            ))
        }

        if rpm < 50 {
            if soakStart == nil { soakStart = now }
        }

        previousRPM = snapshot.rpm
        refreshTrend()
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

    func refreshTrend() {
        let rows = (try? modelContext.fetch(
            FetchDescriptor<CrankRecord>(sortBy: [SortDescriptor(\.date, order: .forward)])
        )) ?? []
        let recent = Array(rows.suffix(20))
        guard recent.count >= 12 else {
            lastTrend = nil
            return
        }
        let points: [(Double, Double)] = recent.enumerated().map { idx, r in
            // Normalize ambient: add back cold penalty for slope stability
            var v = r.minVoltage
            if let a = r.ambientC {
                if a < -10 { v += 0.7 }
                else if a < 5 { v += 0.4 }
            }
            let months = Double(idx) / 30.0 // proxy index spacing
            return (months, v)
        }
        guard let fit = Self.linearRegression(points), fit.r2 > 0.35 else {
            lastTrend = TrendEstimate(
                slopeVPerMonth: 0,
                weeksLeft: nil,
                r2: 0,
                sampleCount: recent.count
            )
            return
        }
        // Re-scale slope: index was 0..n over ~cranks; convert to per-month assuming ~30 cranks/month
        let slopePerCrank = fit.slope
        let slopeVPerMonth = slopePerCrank * 30
        var weeks: Int?
        if slopeVPerMonth < 0, let last = recent.last {
            let weeksLeft = (last.minVoltage - 9.6) / abs(slopeVPerMonth) * 4
            if weeksLeft.isFinite, weeksLeft > 0 {
                weeks = Int(weeksLeft.rounded())
            }
        }
        lastTrend = TrendEstimate(
            slopeVPerMonth: slopeVPerMonth,
            weeksLeft: weeks,
            r2: fit.r2,
            sampleCount: recent.count
        )
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
}
