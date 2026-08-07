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
    private var crossed40 = false
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
        guard let coolant = snapshot.coolantC else { return [] }
        let now = context.now
        let speed = snapshot.speedKmh ?? 0
        let ambient = context.ambientC ?? snapshot.ambientC
        var cues: [CareCue] = []

        if warmupStart == nil, snapshot.isEngineRunning {
            warmupStart = now
            crossed40 = coolant >= 40
        }

        if !warmupDone, let start = warmupStart {
            if !crossed40, coolant >= 40 {
                crossed40 = true
                warmupStart = now // restart timing 40→85
            }
            if crossed40, coolant >= 85 {
                let duration = now.timeIntervalSince(start)
                let bucket = CareBucket.ambient(ambient)
                baseline.observe(
                    key: "warmup.duration",
                    value: duration,
                    bucketKey: bucket,
                    minSamples: 8,
                    range: 60...1800,
                    now: now
                )
                if let snap = baseline.snapshot(key: "warmup.duration", bucketKey: bucket),
                   snap.isMature, duration > snap.p50 * 1.6 {
                    consecutiveSlow += 1
                    if consecutiveSlow >= 3 {
                        caughtFault = true
                        cues.append(slowCue())
                    }
                } else if duration <= (baseline.snapshot(key: "warmup.duration", bucketKey: bucket)?.p50 ?? duration) {
                    consecutiveSlow = 0
                }
                warmupDone = true
            }
            // Fail to reach target
            if now.timeIntervalSince(start) > 900, coolant < 82 {
                caughtFault = true
                cues.append(CareCue(
                    id: "thermostat.open",
                    text: LocalizedCare.string("thermostat.suspectOpen"),
                    severity: .coach,
                    localizationKey: "thermostat.suspectOpen"
                ))
            }
        }

        // Highway cooling
        if speed > 80 {
            if highwayCoolSince == nil { highwayCoolSince = now }
            if let s = highwayCoolSince, now.timeIntervalSince(s) >= 300, coolant < 78 {
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

        // Sudden spike after normal warmup
        if warmupDone {
            if let prev = lastCoolant, coolant - prev > 2 {
                if spikeWatchStart == nil { spikeWatchStart = now }
            }
            if let s = spikeWatchStart, let prev = plateauSamples.first?.1 {
                if now.timeIntervalSince(s) <= 60, coolant - prev >= 12 {
                    cues.append(CareCue(
                        id: "thermostat.closed",
                        text: LocalizedCare.string("thermostat.suspectClosed"),
                        severity: .protective,
                        localizationKey: "thermostat.suspectClosed"
                    ))
                    modelContext.insert(ProtectionEvent(
                        typeRaw: "thermostat",
                        severityRaw: "alarm",
                        value: coolant,
                        thresholdUsed: 12
                    ))
                    try? modelContext.save()
                    spikeWatchStart = nil
                }
            }
        }

        plateauSamples.append((now, coolant))
        plateauSamples = plateauSamples.filter { now.timeIntervalSince($0.0) <= 180 }
        if speed > 50, let mn = plateauSamples.map(\.1).min(), let mx = plateauSamples.map(\.1).max(),
           mx - mn >= 7 {
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
