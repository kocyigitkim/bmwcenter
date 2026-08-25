import Foundation
import SwiftData

@MainActor
final class ThermalShockGuard: CareFeature {
    let id = "thermalShock"
    let requiredPIDs: Set<UInt8> = [0x0C, 0x04]
    let optionalPIDs: Set<UInt8> = [0x0B, 0x33, 0x5C]

    private let modelContext: ModelContext
    private var heatSamples: [(Date, Double)] = []
    private var stopSince: Date?
    private var countdownActive = false
    private var countdownRemaining: Double = 0
    private var lastTLI: Double = 0
    private var recommendedIdle: Double = 0
    private var announcedStart = false
    private var announcedDone = false
    private var idleAccumulated: Double = 0
    private var regenHoldAnnounced = false

    var countdownSeconds: Double? { countdownActive ? countdownRemaining : nil }

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool {
        settings.careThermalShock != "off"
    }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let profile = context.profile
        // Full hybrid: ICE durur/tekrar başlar, kontrollü kapanış zaten var — modül devre dışı.
        guard !profile.flags.contains("noThermalShockModule") else { return [] }

        let now = context.now
        let rpm = snapshot.rpm ?? 0
        let speed = snapshot.speedKmh ?? 0
        let load = snapshot.engineLoadPct ?? 0
        let boost = snapshot.boostKpa ?? 0

        let boostFactor: Double = profile.aspiration != .na
            ? clamp(1.0 + max(boost, 0) / max(profile.maxBoostKpa, 1), 1.0, 2.2)
            : 1.0
        var instant = (rpm / max(profile.redlineRpm, 1)) * (load / 100) * boostFactor
        if let oil = context.oilTempC, oil > 105 {
            instant *= 1.15
        }
        heatSamples.append((now, instant))
        heatSamples = heatSamples.filter { now.timeIntervalSince($0.0) <= 300 }

        let tli = Self.computeTLI(samples: heatSamples, now: now)
        lastTLI = tli
        var wait = Self.recommendedIdle(tli: tli) * Self.profileFactor(profile: profile)
        recommendedIdle = wait

        var cues: [CareCue] = []

        if profile.hasDPF, context.regenActive {
            wait = max(wait, 90)
            recommendedIdle = wait
            if !regenHoldAnnounced, speed < 2, rpm > 300 {
                regenHoldAnnounced = true
                cues.append(CareCue(
                    id: "thermal.regenHold",
                    text: LocalizedCare.string("thermal.countdown.voice", Int(wait.rounded())),
                    severity: .protective,
                    localizationKey: "thermal.countdown.voice"
                ))
            }
        } else {
            regenHoldAnnounced = false
        }

        if speed < 2, rpm > 300 {
            if stopSince == nil { stopSince = now }
            let stoppedFor = now.timeIntervalSince(stopSince ?? now)
            if wait > 0, stoppedFor >= 20 {
                if !countdownActive {
                    countdownActive = true
                    countdownRemaining = wait
                    idleAccumulated = 0
                    announcedStart = false
                    announcedDone = false
                }
                idleAccumulated += 1
                countdownRemaining = max(0, wait - idleAccumulated)
                context.thermalCountdownS = countdownRemaining

                if !announcedStart {
                    announcedStart = true
                    let secs = Int(wait.rounded())
                    cues.append(CareCue(
                        id: "thermal.start",
                        text: LocalizedCare.string("thermal.countdown.voice", secs),
                        severity: .protective,
                        localizationKey: "thermal.countdown.voice"
                    ))
                }
                if countdownRemaining <= 0, !announcedDone {
                    announcedDone = true
                    cues.append(CareCue(
                        id: "thermal.done",
                        text: LocalizedCare.string("thermal.done.voice"),
                        severity: .celebration,
                        localizationKey: "thermal.done.voice"
                    ))
                    modelContext.insert(ThermalEvent(
                        tli: tli, recommendedIdleS: wait, actualIdleS: idleAccumulated, compliant: true
                    ))
                    try? modelContext.save()
                }
            }
        } else if speed >= 2 {
            stopSince = nil
            if countdownActive, countdownRemaining > 0 {
                countdownActive = false
                context.thermalCountdownS = nil
            }
        }

        // Hot shutdown: rpm → 0 while cooldown incomplete.
        if rpm < 50, countdownActive, countdownRemaining > 0 {
            modelContext.insert(ThermalEvent(
                tli: tli, recommendedIdleS: wait, actualIdleS: idleAccumulated, compliant: false
            ))
            try? modelContext.save()
            if profile.hasAuxElectricCoolantPump.value {
                // Kontak sonrası elektrikli pompa işi yapar — bilgi amaçlı, ceza yok.
                cues.append(CareCue(
                    id: "thermal.hotShutdownSoft",
                    text: LocalizedCare.string("thermal.done.voice"),
                    severity: .coach,
                    localizationKey: "thermal.done.voice"
                ))
            } else {
                modelContext.insert(ProtectionEvent(
                    typeRaw: "hotShutdown", severityRaw: "alarm", value: tli, thresholdUsed: wait
                ))
                try? modelContext.save()
            }
            countdownActive = false
            context.thermalCountdownS = nil
        }

        return cues
    }

    /// §4 profileFactor — modern su soğutmalı turbo + kontak sonrası pompa büyük ölçüde
    /// önerilen bekleme süresini eritir; NA motorda öneri hiç üretilmez (sadece log).
    nonisolated static func profileFactor(profile: VehicleDiagnosticProfile) -> Double {
        if profile.fuel == .diesel, profile.hasDPF { return 0.6 }
        guard profile.aspiration != .na else { return 0.0 }
        if profile.turboWaterCooled, profile.hasAuxElectricCoolantPump.value { return 0.25 }
        if profile.turboWaterCooled { return 0.5 }
        return 1.0
    }

    nonisolated static func computeTLI(samples: [(Date, Double)], now: Date) -> Double {
        guard samples.count >= 2 else { return samples.last?.1 ?? 0 }
        var sum = 0.0
        for i in 1..<samples.count {
            let dt = samples[i].0.timeIntervalSince(samples[i - 1].0)
            sum += samples[i].1 * max(dt, 0)
        }
        return sum / 300
    }

    nonisolated static func recommendedIdle(tli: Double) -> Double {
        switch tli {
        case ..<0.25: return 0
        case 0.25..<0.45: return 20
        case 0.45..<0.70: return 45
        case 0.70..<1.00: return 75
        default: return 120
        }
    }

    private func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(max(v, lo), hi)
    }
}
