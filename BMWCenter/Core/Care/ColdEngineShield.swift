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
        var cues: [CareCue] = []
        let now = context.now
        if tripStartedAt == nil { tripStartedAt = now }

        let oil = context.oilTempC ?? snapshot.coolantC ?? 20
        let rpm = snapshot.rpm ?? 0
        let load = snapshot.engineLoadPct ?? 0
        let speed = snapshot.speedKmh ?? 0
        let boost = snapshot.boostKpa ?? 0
        let diesel = context.fuelType == .diesel
        let caps = Self.caps(oilTempC: oil, diesel: diesel)

        context.isColdPhase = oil < 80

        if speed < 2, rpm > 300 {
            if idleSince == nil { idleSince = now }
        } else {
            idleSince = nil
        }

        if let idleSince {
            let idleS = now.timeIntervalSince(idleSince)
            let wasteThreshold: TimeInterval = (context.ambientC ?? 15) < 0 ? 360 : 180
            if idleS >= 40, !readyAnnounced, oil < 60 {
                readyAnnounced = true
                cues.append(CareCue(
                    id: "cold.ready",
                    text: LocalizedCare.string("cold.ready.voice"),
                    severity: .celebration,
                    localizationKey: "cold.ready.voice"
                ))
            }
            if idleS > wasteThreshold, !longIdleAnnounced {
                longIdleAnnounced = true
                cues.append(CareCue(
                    id: "cold.longIdle",
                    text: LocalizedCare.string("cold.longIdle.voice"),
                    severity: .coach,
                    localizationKey: "cold.longIdle.voice"
                ))
            }
            if idleS > 480, !heavyIdleAnnounced {
                heavyIdleAnnounced = true
                cues.append(CareCue(
                    id: "cold.heavyIdle",
                    text: LocalizedCare.string("cold.longIdle.voice"),
                    severity: .coach,
                    localizationKey: "cold.longIdle.voice"
                ))
            }
        }

        guard let rpmCap = caps.rpm, let loadCap = caps.load else {
            violationStreakStart = nil
            return cues
        }

        var violating = rpm > rpmCap || load > loadCap
        if context.isTurbo, oil < 60, boost > 60 {
            violating = true
        }

        if violating {
            if violationStreakStart == nil { violationStreakStart = now }
            if let start = violationStreakStart, now.timeIntervalSince(start) >= 1.5 {
                tripViolations += 1
                violationStreakStart = now.addingTimeInterval(10) // debounce
                logEvent(value: rpm, threshold: rpmCap, trip: nil)
                switch tripViolations {
                case 1:
                    cues.append(CareCue(
                        id: "cold.v1",
                        text: LocalizedCare.string("cold.firstViolation.voice"),
                        severity: .coach,
                        localizationKey: "cold.firstViolation.voice"
                    ))
                case 2:
                    cues.append(CareCue(
                        id: "cold.v2",
                        text: LocalizedCare.string("cold.repeatViolation.voice"),
                        severity: .protective,
                        localizationKey: "cold.repeatViolation.voice"
                    ))
                default:
                    break
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

    nonisolated static func caps(oilTempC: Double, diesel: Bool) -> (rpm: Double?, load: Double?) {
        let scale = diesel ? 0.82 : 1.0
        switch oilTempC {
        case ..<20: return (2300 * scale, 45)
        case 20..<40: return (2800 * scale, 55)
        case 40..<60: return (3400 * scale, 65)
        case 60..<80: return (4200 * scale, 80)
        default: return (nil, nil)
        }
    }

    private func logEvent(value: Double, threshold: Double, trip: Trip?) {
        let ev = ProtectionEvent(
            typeRaw: "coldRev",
            severityRaw: "alarm",
            value: value,
            thresholdUsed: threshold,
            trip: trip
        )
        modelContext.insert(ev)
        try? modelContext.save()
    }
}
