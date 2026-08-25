import Foundation
import SwiftData

@MainActor
final class ThermostatWatch: CareFeature {
    let id = "thermostat"
    let requiredPIDs: Set<UInt8> = [0x05]
    let optionalPIDs: Set<UInt8> = [0x46, 0x1F, 0x0D]

    private let baseline: BaselineLearner
    private let modelContext: ModelContext
    private var warmupStart: Date?
    private var warmupWork: Double = 0
    private var lastSampleAt: Date?
    private var warmupDone = false
    private var consecutiveSlow = 0
    private var highwayCoolSince: Date?
    private var lastCoolant: Double?
    private var spikeWatchStart: Date?
    private var plateauSamples: [(Date, Double)] = []
    private(set) var caughtFault = false

    init(baseline: BaselineLearner, modelContext: ModelContext) {
        self.baseline = baseline
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careThermostatWatch }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        guard let coolant = snapshot.coolantC, context.canHealthy else { return [] }
        let profile = context.profile
        let now = context.now
        let speed = snapshot.speedKmh ?? 0
        let normLoad = context.normLoad ?? snapshot.engineLoadPct ?? 0
        let rpm = snapshot.rpm ?? 0
        let ambient = context.effectiveAmbientC ?? context.ambientC ?? snapshot.ambientC ?? 15
        var cues: [CareCue] = []

        let target = profile.warmupTargetC
        if warmupStart == nil, snapshot.isEngineRunning {
            warmupStart = now
            warmupWork = 0
            lastSampleAt = now
        }

        if !warmupDone, let start = warmupStart {
            let dt = lastSampleAt.map { min(2, now.timeIntervalSince($0)) } ?? 1
            lastSampleAt = now
            warmupWork += normLoad * rpm * dt

            if coolant >= target {
                let normFactor = 1 + max(0, 20 - ambient) * 0.02
                let wNorm = warmupWork / normFactor
                let bucket = CareBucket.ambient(ambient)
                baseline.observe(
                    key: "warmup.work", value: wNorm, bucketKey: bucket,
                    minSamples: 8, range: 0...5_000_000, now: now
                )
                if let snap = baseline.snapshot(key: "warmup.work", bucketKey: bucket),
                   snap.isMature, wNorm > snap.p50 * 1.6 {
                    consecutiveSlow += 1
                    if consecutiveSlow >= 3 {
                        caughtFault = true
                        cues.append(slowCue())
                    }
                } else if let snap = baseline.snapshot(key: "warmup.work", bucketKey: bucket), wNorm <= snap.p50 {
                    consecutiveSlow = 0
                }
                warmupDone = true
            }

            let idleShareIsHigh = profile.fuel == .diesel && rpm > 300 && speed < 2
            let openTimeoutS: TimeInterval = ambient > 5 ? 900 : 1500
            if !idleShareIsHigh, now.timeIntervalSince(start) > openTimeoutS, coolant < target - 8 {
                caughtFault = true
                cues.append(CareCue(
                    id: "thermostat.open",
                    text: LocalizedCare.string("thermostat.suspectOpen"),
                    severity: .coach,
                    localizationKey: "thermostat.suspectOpen"
                ))
            }
        }

        if speed > 80 {
            if highwayCoolSince == nil { highwayCoolSince = now }
            let coldPenalty = min(max((10 - ambient) * 0.6, 0), 8)
            if let s = highwayCoolSince, now.timeIntervalSince(s) >= 300,
               coolant < profile.thermostatOpenC.value - 12 - coldPenalty {
                caughtFault = true
                cues.append(CareCue(
                    id: "thermostat.highway",
                    text: LocalizedCare.string("thermostat.highwayCooling"),
                    severity: .coach,
                    localizationKey: "thermostat.highwayCooling"
                ))
                highwayCoolSince = now.addingTimeInterval(600)
            }
        } else {
            highwayCoolSince = nil
        }

        if warmupDone {
            if let prev = lastCoolant, coolant - prev > 2 {
                if spikeWatchStart == nil { spikeWatchStart = now }
            }
            if let s = spikeWatchStart, let prev = plateauSamples.first?.1 {
                if now.timeIntervalSince(s) <= 60, coolant - prev >= 12, speed >= 5 {
                    cues.append(CareCue(
                        id: "thermostat.closed",
                        text: LocalizedCare.string("thermostat.suspectClosed"),
                        severity: .protective,
                        localizationKey: "thermostat.suspectClosed"
                    ))
                    modelContext.insert(ProtectionEvent(
                        typeRaw: "thermostat", severityRaw: "alarm", value: coolant, thresholdUsed: 12
                    ))
                    try? modelContext.save()
                    spikeWatchStart = nil
                } else if now.timeIntervalSince(s) > 60 {
                    spikeWatchStart = nil
                }
            }
        }

        plateauSamples.append((now, coolant))
        plateauSamples = plateauSamples.filter { now.timeIntervalSince($0.0) <= 180 }
        let plateauThreshold: Double = profile.mapControlledThermostat.value ? 12 : 7
        if speed > 50, let mn = plateauSamples.map(\.1).min(), let mx = plateauSamples.map(\.1).max(),
           mx - mn >= plateauThreshold {
            cues.append(CareCue(
                id: "thermostat.plateau",
                text: LocalizedCare.string("thermostat.slowWarmup"),
                severity: .coach,
                localizationKey: "thermostat.slowWarmup"
            ))
        }

        lastCoolant = coolant
        return cues
    }

    private func slowCue() -> CareCue {
        CareCue(
            id: "thermostat.slow",
            text: LocalizedCare.string("thermostat.slowWarmup"),
            severity: .coach,
            localizationKey: "thermostat.slowWarmup"
        )
    }
}
