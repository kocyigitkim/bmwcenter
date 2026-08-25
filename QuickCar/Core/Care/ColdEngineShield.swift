import Foundation
import SwiftData

@MainActor
final class ColdEngineShield: CareFeature {
    let id = "coldShield"
    let requiredPIDs: Set<UInt8> = [0x05, 0x0C, 0x04]
    let optionalPIDs: Set<UInt8> = [0x5C, 0x46]

    private let modelContext: ModelContext
    private var violationStreakStart: Date?
    private var tripViolations = 0
    private var idleSince: Date?
    private var readyAnnounced = false
    private var longIdleAnnounced = false
    private var heavyIdleAnnounced = false
    private var tripStartedAt: Date?

    var coldViolationsThisTrip: Int { tripViolations }

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careColdShield }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let profile = context.profile
        guard !profile.flags.contains("noIdleModule") else { return [] }

        var cues: [CareCue] = []
        let now = context.now
        if tripStartedAt == nil { tripStartedAt = now }

        let ambient = context.effectiveAmbientC ?? context.ambientC ?? 15
        let oil = Self.estimatedOilTemp(
            measured: context.oilTempC, coolant: snapshot.coolantC,
            ambient: ambient, runtimeS: snapshot.runtimeS ?? 0, oilGrade: profile.oilGrade
        )
        let rpm = snapshot.rpm ?? 0
        let normLoad = context.normLoad ?? snapshot.engineLoadPct ?? 0
        let speed = snapshot.speedKmh ?? 0
        let boost = snapshot.boostKpa ?? 0
        let diesel = profile.fuel == .diesel

        context.isColdPhase = oil < profile.oilWarmC

        // Katalizör ısıtma fazı — soğuk start, kısa süre yüksek rölanti rpm, arıza değil.
        let catalystWarmup = (snapshot.runtimeS ?? 999) < 90 && (snapshot.coolantC ?? 99) < 40 && speed < 2

        if speed < 2, rpm > 300 {
            if idleSince == nil { idleSince = now }
        } else {
            idleSince = nil
        }

        if let idleSince {
            let idleS = now.timeIntervalSince(idleSince)
            var wasteThreshold: TimeInterval = ambient < 0 ? 360 : (ambient < 10 ? 240 : 180)
            if diesel { wasteThreshold *= 1.3 }
            if idleS >= 40, !readyAnnounced, oil < 60 {
                readyAnnounced = true
                cues.append(CareCue(
                    id: "cold.ready", text: LocalizedCare.string("cold.ready.voice"),
                    severity: .celebration, localizationKey: "cold.ready.voice"
                ))
            }
            if idleS > wasteThreshold, !longIdleAnnounced {
                longIdleAnnounced = true
                cues.append(CareCue(
                    id: "cold.longIdle", text: LocalizedCare.string("cold.longIdle.voice"),
                    severity: .coach, localizationKey: "cold.longIdle.voice"
                ))
            }
            if idleS > 480, !heavyIdleAnnounced {
                heavyIdleAnnounced = true
                cues.append(CareCue(
                    id: "cold.heavyIdle", text: LocalizedCare.string("cold.longIdle.voice"),
                    severity: .coach, localizationKey: "cold.longIdle.voice"
                ))
            }
        }

        guard !catalystWarmup else {
            violationStreakStart = nil
            return cues
        }

        let caps = Self.caps(oilTempC: oil, redlineRpm: profile.redlineRpm, diesel: diesel)
        guard let rpmCap = caps.rpm, let loadCap = caps.load else {
            violationStreakStart = nil
            return cues
        }

        var violating = rpm > rpmCap || normLoad > loadCap
        var severeMargin = false
        if rpm > rpmCap { severeMargin = severeMargin || (rpm - rpmCap) / rpmCap > 0.25 }
        if normLoad > loadCap { severeMargin = severeMargin || (normLoad - loadCap) > 25 }
        if profile.aspiration != .na, oil < 60, boost > profile.maxBoostKpa * 0.5 {
            violating = true
        }

        if violating {
            if violationStreakStart == nil { violationStreakStart = now }
            if let start = violationStreakStart, now.timeIntervalSince(start) >= 1.5 {
                let marginTooSmall = !severeMargin
                    && rpm <= rpmCap * 1.10 && normLoad <= loadCap + 10
                violationStreakStart = now.addingTimeInterval(10)
                tripViolations += 1
                logEvent(value: rpm, threshold: rpmCap)
                if !marginTooSmall, tripViolations <= 2 {
                    switch severeMargin ? 2 : tripViolations {
                    case 1:
                        cues.append(CareCue(
                            id: "cold.v1", text: LocalizedCare.string("cold.firstViolation.voice"),
                            severity: .coach, localizationKey: "cold.firstViolation.voice"
                        ))
                    default:
                        cues.append(CareCue(
                            id: "cold.v2", text: LocalizedCare.string("cold.repeatViolation.voice"),
                            severity: .protective, localizationKey: "cold.repeatViolation.voice"
                        ))
                    }
                }
            }
        } else {
            violationStreakStart = nil
        }
        return cues
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] {
        defer { resetTrip() }
        return []
    }

    func resetTrip() {
        tripViolations = 0
        violationStreakStart = nil
        idleSince = nil
        readyAnnounced = false
        longIdleAnnounced = false
        heavyIdleAnnounced = false
        tripStartedAt = nil
    }

    /// Ölçülü oilTemp PID yoksa coolant + geçen süreden model üretir; `oilGrade` ısınma
    /// gecikmesini ayarlar (w0_20 hızlı, w5_40 yavaş).
    nonisolated static func estimatedOilTemp(
        measured: Double?, coolant: Double?, ambient: Double, runtimeS: Double, oilGrade: VehicleDiagnosticProfile.OilGrade
    ) -> Double {
        if let measured { return measured }
        let coolant = coolant ?? ambient
        let gradeScale: Double = oilGrade == .w0_20 ? 1.15 : (oilGrade == .w5_40 ? 0.85 : 1.0)
        let f: Double
        switch runtimeS * gradeScale {
        case ..<0: f = 0
        case 0..<600: f = (runtimeS * gradeScale / 600) * 0.75
        case 600..<900: f = 0.75 + ((runtimeS * gradeScale - 600) / 300) * 0.15
        default: f = 0.9
        }
        return ambient + (coolant - ambient) * min(max(f, 0), 0.9)
    }

    /// Redline yüzdesi olarak cap tablosu — mutlak rpm yerine motor bağımsız oranlı sınır.
    nonisolated static func caps(oilTempC: Double, redlineRpm: Double, diesel: Bool) -> (rpm: Double?, load: Double?) {
        let scale = diesel ? 0.9 : 1.0
        let pct: (Double, Double)?
        switch oilTempC {
        case ..<20: pct = (0.35, 45)
        case 20..<40: pct = (0.42, 55)
        case 40..<60: pct = (0.52, 65)
        case 60..<80: pct = (0.64, 80)
        default: pct = nil
        }
        guard let pct else { return (nil, nil) }
        return (redlineRpm * pct.0 * scale, pct.1)
    }

    private func logEvent(value: Double, threshold: Double) {
        let ev = ProtectionEvent(typeRaw: "coldRev", severityRaw: "alarm", value: value, thresholdUsed: threshold)
        modelContext.insert(ev)
        try? modelContext.save()
    }
}
