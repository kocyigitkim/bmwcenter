import Foundation
import SwiftData

@MainActor
final class OverheatWatchdog: CareFeature {
    let id = "overheat"
    let requiredPIDs: Set<UInt8> = [0x05]
    let optionalPIDs: Set<UInt8> = [0x46, 0x04, 0x0D]

    /// How long after the engine first reports "running" to distrust readings.
    /// Cranking causes battery-voltage sag, which is a known source of corrupted
    /// ELM327 responses (e.g. a garbled coolant-temp byte reads as a huge spike).
    private static let startupGraceS: TimeInterval = 8
    /// Consecutive time a threshold must be exceeded before we trust it enough to alert.
    private static let confirmS: TimeInterval = 3
    /// Reject a single sample if it implies a physically implausible jump.
    private static let maxPlausibleDeltaC: Double = 15
    private static let maxPlausibleDeltaWindowS: TimeInterval = 5

    private let baseline: BaselineLearner
    private let modelContext: ModelContext
    private var coolantHistory: [(Date, Double)] = []
    private var lastLevel: String?
    private var fanAnnounced = false
    private var unstableAnnounced = false
    private var wasEngineRunning = false
    private var engineStartedAt: Date?
    private var lastAcceptedCoolant: (Date, Double)?
    private var criticalStreakStart: Date?
    private var alarmStreakStart: Date?

    init(baseline: BaselineLearner, modelContext: ModelContext) {
        self.baseline = baseline
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careOverheatWatchdog }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        guard let rawCoolant = snapshot.coolantC else { return [] }
        let now = context.now

        let running = snapshot.isEngineRunning
        if running, !wasEngineRunning {
            engineStartedAt = now
        }
        wasEngineRunning = running

        guard running else {
            // Engine off or cranking: readings are unreliable (voltage sag), don't evaluate.
            criticalStreakStart = nil
            alarmStreakStart = nil
            return []
        }

        // Reject implausible jumps (a real coolant temp can't move this fast) —
        // most commonly a corrupted PID 0x05 byte from crank-induced voltage sag.
        if let last = lastAcceptedCoolant,
           now.timeIntervalSince(last.0) < Self.maxPlausibleDeltaWindowS,
           abs(rawCoolant - last.1) > Self.maxPlausibleDeltaC {
            return []
        }
        let coolant = rawCoolant
        lastAcceptedCoolant = (now, coolant)

        let inStartupGrace = (engineStartedAt.map { now.timeIntervalSince($0) } ?? .infinity) < Self.startupGraceS

        let speed = snapshot.speedKmh ?? 0
        let load = snapshot.engineLoadPct ?? 0
        let runtime = snapshot.runtimeS ?? 0
        let ambient = context.ambientC ?? snapshot.ambientC

        coolantHistory.append((now, coolant))
        coolantHistory = coolantHistory.filter { now.timeIntervalSince($0.0) <= 600 }

        // Learn baseline when stable cruise
        if coolant > 85, snapshot.isEngineRunning, runtime > 600, speed > 20 {
            let recent = coolantHistory.filter { now.timeIntervalSince($0.0) <= 60 }
            if let minC = recent.map(\.1).min(), let maxC = recent.map(\.1).max(),
               maxC - minC < 2 {
                let bucket = CareBucket.composite(ambient: ambient, load: load, speed: speed)
                baseline.observe(
                    key: "coolant.cruise",
                    value: coolant,
                    bucketKey: bucket,
                    minSamples: 200,
                    range: 70...130,
                    now: now
                )
            }
        }

        let thresholds = Self.thresholds(
            baselineP95: baseline.snapshot(
                key: "coolant.cruise",
                bucketKey: CareBucket.composite(ambient: ambient, load: load, speed: speed)
            )?.p95,
            mature: baseline.isMature(
                key: "coolant.cruise",
                bucketKey: CareBucket.composite(ambient: ambient, load: load, speed: speed),
                minSamples: 200
            ),
            ambientC: ambient,
            load: load,
            speed: speed,
            sensitivityOffset: context.sensitivityOffsetC
        )

        var cues: [CareCue] = []

        // Rapid rise
        let last30 = coolantHistory.filter { now.timeIntervalSince($0.0) <= 30 }
        if !inStartupGrace, let first = last30.first?.1, coolant - first >= 8 {
            cues.append(alarmCue())
            log(type: "overheat", severity: "alarm", value: coolant, threshold: thresholds.alarm)
            lastLevel = "alarm"
            return cues
        }

        // Fan suspect
        let last90 = coolantHistory.filter { now.timeIntervalSince($0.0) <= 90 }
        if speed < 5, let first = last90.first?.1, coolant - first >= 6, !fanAnnounced {
            fanAnnounced = true
            cues.append(CareCue(
                id: "overheat.fan",
                text: LocalizedCare.string("overheat.fanSuspect"),
                severity: .protective,
                localizationKey: "overheat.fanSuspect"
            ))
        }

        // Unstable oscillation at steady speed
        if speed > 40, !unstableAnnounced {
            let window = coolantHistory.filter { now.timeIntervalSince($0.0) <= 600 }
            if Self.oscillationCount(window, amplitude: 8) >= 3 {
                unstableAnnounced = true
                cues.append(CareCue(
                    id: "overheat.unstable",
                    text: LocalizedCare.string("overheat.unstable"),
                    severity: .protective,
                    localizationKey: "overheat.unstable"
                ))
            }
        }

        if inStartupGrace {
            // Don't trust readings enough to alert right after start, but don't
            // let a transient spike arm the streak either.
            criticalStreakStart = nil
            alarmStreakStart = nil
        } else if coolant >= thresholds.critical {
            alarmStreakStart = nil
            if criticalStreakStart == nil { criticalStreakStart = now }
            if now.timeIntervalSince(criticalStreakStart!) >= Self.confirmS {
                if lastLevel != "critical" {
                    cues.append(CareCue(
                        id: "overheat.critical",
                        text: LocalizedCare.string("overheat.critical.voice"),
                        severity: .critical,
                        localizationKey: "overheat.critical.voice"
                    ))
                    log(type: "overheat", severity: "critical", value: coolant, threshold: thresholds.critical)
                }
                lastLevel = "critical"
            }
        } else if coolant >= thresholds.alarm {
            criticalStreakStart = nil
            if alarmStreakStart == nil { alarmStreakStart = now }
            if now.timeIntervalSince(alarmStreakStart!) >= Self.confirmS {
                if lastLevel != "alarm", lastLevel != "critical" {
                    cues.append(alarmCue())
                    log(type: "overheat", severity: "alarm", value: coolant, threshold: thresholds.alarm)
                }
                lastLevel = "alarm"
            }
        } else if coolant >= thresholds.watch {
            criticalStreakStart = nil
            alarmStreakStart = nil
            lastLevel = "watch"
        } else {
            criticalStreakStart = nil
            alarmStreakStart = nil
            lastLevel = nil
        }

        return cues
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] {
        // Cooling drift check (coach at trip end)
        defer {
            fanAnnounced = false
            unstableAnnounced = false
            lastLevel = nil
            wasEngineRunning = false
            engineStartedAt = nil
            lastAcceptedCoolant = nil
            criticalStreakStart = nil
            alarmStreakStart = nil
        }
        return []
    }

    nonisolated static func thresholds(
        baselineP95: Double?,
        mature: Bool,
        ambientC: Double?,
        load: Double,
        speed: Double,
        sensitivityOffset: Double
    ) -> (watch: Double, alarm: Double, critical: Double) {
        var watch: Double
        var alarm: Double
        var critical: Double
        if mature, let p95 = baselineP95 {
            watch = p95 + 3
            alarm = min(max(p95 + 6, 100), 116)
            critical = min(max(min(p95 + 10, 118), 108), 122)
        } else {
            watch = 103
            alarm = 108
            critical = 116
        }
        var adj = sensitivityOffset
        if let a = ambientC, a > 35 { adj += 2 }
        if load > 85, speed < 20 { adj += 2 }
        return (watch + adj, alarm + adj, critical + adj)
    }

    nonisolated static func oscillationCount(_ samples: [(Date, Double)], amplitude: Double) -> Int {
        guard samples.count >= 4 else { return 0 }
        var peaks = 0
        var lastDir = 0
        for i in 1..<samples.count {
            let d = samples[i].1 - samples[i - 1].1
            let dir = d > 0.5 ? 1 : (d < -0.5 ? -1 : 0)
            if dir != 0, lastDir != 0, dir != lastDir, abs(d) >= amplitude / 4 {
                peaks += 1
            }
            if dir != 0 { lastDir = dir }
        }
        // Rough: count half-cycles that span ±amplitude
        let vals = samples.map(\.1)
        guard let mn = vals.min(), let mx = vals.max(), mx - mn >= amplitude else { return 0 }
        return max(peaks / 2, mx - mn >= amplitude * 2 ? 3 : 1)
    }

    private func alarmCue() -> CareCue {
        CareCue(
            id: "overheat.alarm",
            text: LocalizedCare.string("overheat.alarm.voice"),
            severity: .protective,
            localizationKey: "overheat.alarm.voice"
        )
    }

    private func log(type: String, severity: String, value: Double, threshold: Double) {
        modelContext.insert(ProtectionEvent(
            typeRaw: type,
            severityRaw: severity,
            value: value,
            thresholdUsed: threshold
        ))
        try? modelContext.save()
    }
}
