import Foundation
import SwiftData

@MainActor
final class OverheatWatchdog: CareFeature {
    let id = "overheat"
    let requiredPIDs: Set<UInt8> = [0x05]
    let optionalPIDs: Set<UInt8> = [0x46, 0x04, 0x0D]

    /// Motor durduktan sonra bu süre içinde yeniden çalıştırılırsa "hot restart" sayılır —
    /// heat-soak zirvesi (kapalı motorda blok ısısı soğutucuya geri yayılır) fiziksel, arıza değil.
    private static let hotRestartSoakS: TimeInterval = 20 * 60
    private static let confirmS: TimeInterval = 3
    /// Mutlak sıçrama yerine oran bazlı reddet — düşük frekanslı örneklemede de çalışır.
    private static let maxPlausibleDeltaCPerS: Double = 3

    private let baseline: BaselineLearner
    private let modelContext: ModelContext
    private var coolantHistory: [(Date, Double)] = []
    private var lastLevel: String?
    private var fanAnnounced = false
    private var unstableAnnounced = false
    private var wasEngineRunning = false
    private var engineStartedAt: Date?
    private var engineStoppedAt: Date?
    private var lastAcceptedCoolant: (Date, Double)?
    private var criticalStreakStart: Date?
    private var alarmStreakStart: Date?
    private var gradeLoadStart: Date?

    init(baseline: BaselineLearner, modelContext: ModelContext) {
        self.baseline = baseline
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careOverheatWatchdog }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        guard let rawCoolant = snapshot.coolantC, context.canHealthy else {
            if !context.canHealthy { criticalStreakStart = nil; alarmStreakStart = nil }
            return []
        }
        let now = context.now
        let profile = context.profile

        let running = snapshot.isEngineRunning
        if running, !wasEngineRunning {
            engineStartedAt = now
        } else if !running, wasEngineRunning {
            engineStoppedAt = now
        }
        wasEngineRunning = running

        guard running else {
            criticalStreakStart = nil
            alarmStreakStart = nil
            return []
        }

        if let last = lastAcceptedCoolant {
            let dt = now.timeIntervalSince(last.0)
            if dt > 0, abs(rawCoolant - last.1) / dt > Self.maxPlausibleDeltaCPerS {
                return []
            }
        }
        let coolant = rawCoolant
        lastAcceptedCoolant = (now, coolant)

        let sinceStart = engineStartedAt.map { now.timeIntervalSince($0) } ?? .infinity
        let wasHotRestart = engineStoppedAt.map { now.timeIntervalSince($0) < Self.hotRestartSoakS } ?? false
        let startupGraceS: TimeInterval = wasHotRestart ? 90 : 45
        let inStartupGrace = sinceStart < startupGraceS || coolant < profile.thermostatOpenC.value

        let speed = snapshot.speedKmh ?? 0
        let normLoad = context.normLoad ?? snapshot.engineLoadPct ?? 0
        let runtime = snapshot.runtimeS ?? 0
        let ambient = context.effectiveAmbientC ?? context.ambientC ?? snapshot.ambientC

        coolantHistory.append((now, coolant))
        coolantHistory = coolantHistory.filter { now.timeIntervalSince($0.0) <= 600 }

        if coolant > profile.thermostatOpenC.value, running, runtime > 600, speed > 25 {
            let recent = coolantHistory.filter { now.timeIntervalSince($0.0) <= 60 }
            if let minC = recent.map(\.1).min(), let maxC = recent.map(\.1).max(), maxC - minC < 2 {
                let bucket = CareBucket.composite(ambient: ambient, load: normLoad, speed: speed)
                baseline.observe(
                    key: "coolant.cruise", value: coolant, bucketKey: bucket,
                    minSamples: 200, range: 70...140, now: now
                )
            }
        }

        let bucket = CareBucket.composite(ambient: ambient, load: normLoad, speed: speed)
        let mature = baseline.isMature(key: "coolant.cruise", bucketKey: bucket, minSamples: 200)
        let thresholds = Self.thresholds(
            profile: profile,
            baselineP95: mature ? baseline.snapshot(key: "coolant.cruise", bucketKey: bucket)?.p95 : nil,
            ambientC: ambient,
            normLoad: normLoad,
            speed: speed,
            altitudeM: profile.altitudeM,
            gradeLoad: gradeSuspected(snapshot: snapshot, speed: speed, now: now),
            sensitivityOffset: context.sensitivityOffsetC
        )
        let tier = context.confidenceTier

        var cues: [CareCue] = []
        let isWarmedUp = coolant >= profile.thermostatOpenC.value

        let last30 = coolantHistory.filter { now.timeIntervalSince($0.0) <= 30 }
        if !inStartupGrace, coolant >= profile.thermostatOpenC.value + 5,
           let first = last30.first?.1, coolant - first >= 8 {
            cues.append(alarmCue())
            log(type: "overheat", severity: "alarm", value: coolant, threshold: thresholds.alarm)
            lastLevel = "alarm"
            return cues
        }

        let fanDelayS: TimeInterval = profile.fanType == .viscousClutch ? 150 : 90
        let fanDeltaThreshold: Double = profile.fanType == .viscousClutch ? 11 : 5
        let fanTemp = profile.effectiveFanOnC + (profile.fanType == .viscousClutch ? 6 : 4)
        let lastFan = coolantHistory.filter { now.timeIntervalSince($0.0) <= fanDelayS }
        if speed < 5, isWarmedUp, coolant >= fanTemp,
           let first = lastFan.first?.1, coolant - first >= fanDeltaThreshold, !fanAnnounced {
            fanAnnounced = true
            cues.append(CareCue(
                id: "overheat.fan", text: LocalizedCare.string("overheat.fanSuspect"),
                severity: .protective, localizationKey: "overheat.fanSuspect"
            ))
        }

        let oscillationAmplitude: Double = profile.mapControlledThermostat.value ? 12 : 8
        if speed > 40, !unstableAnnounced {
            let window = coolantHistory.filter { now.timeIntervalSince($0.0) <= 600 }
            if Self.oscillationCount(window, amplitude: oscillationAmplitude) >= 3 {
                unstableAnnounced = true
                cues.append(CareCue(
                    id: "overheat.unstable", text: LocalizedCare.string("overheat.unstable"),
                    severity: .protective, localizationKey: "overheat.unstable"
                ))
            }
        }

        if inStartupGrace {
            criticalStreakStart = nil
            alarmStreakStart = nil
        } else if coolant >= thresholds.critical {
            alarmStreakStart = nil
            if criticalStreakStart == nil { criticalStreakStart = now }
            if now.timeIntervalSince(criticalStreakStart!) >= Self.confirmS {
                if lastLevel != "critical" {
                    cues.append(CareCue(
                        id: "overheat.critical", text: LocalizedCare.string("overheat.critical.voice"),
                        severity: .critical, localizationKey: "overheat.critical.voice"
                    ))
                    log(type: "overheat", severity: "critical", value: coolant, threshold: thresholds.critical)
                }
                lastLevel = "critical"
            }
        } else if coolant >= thresholds.alarm, tier >= .t1 {
            criticalStreakStart = nil
            if alarmStreakStart == nil { alarmStreakStart = now }
            if now.timeIntervalSince(alarmStreakStart!) >= Self.confirmS {
                if lastLevel != "alarm", lastLevel != "critical" {
                    cues.append(alarmCue())
                    log(type: "overheat", severity: "alarm", value: coolant, threshold: thresholds.alarm)
                }
                lastLevel = "alarm"
            }
        } else if coolant >= thresholds.watch, tier >= .t2 {
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
        defer {
            fanAnnounced = false
            unstableAnnounced = false
            lastLevel = nil
            wasEngineRunning = false
            engineStartedAt = nil
            lastAcceptedCoolant = nil
            criticalStreakStart = nil
            alarmStreakStart = nil
            gradeLoadStart = nil
        }
        return []
    }

    /// Römork/dik yokuş göstergesi yoktur — sürekli yüksek load + düşük hız + yüksek pedal
    /// bunun en iyi proxy'sidir.
    private func gradeSuspected(snapshot: VehicleSnapshot, speed: Double, now: Date) -> Bool {
        let heavyLoad = (snapshot.engineLoadPct ?? 0) > 80 && speed > 10 && speed < 60
            && (snapshot.pedalPct ?? 0) > 70
        if heavyLoad {
            if gradeLoadStart == nil { gradeLoadStart = now }
            return now.timeIntervalSince(gradeLoadStart!) >= 60
        }
        gradeLoadStart = nil
        return false
    }

    nonisolated static func thresholds(
        profile: VehicleDiagnosticProfile,
        baselineP95: Double?,
        ambientC: Double?,
        normLoad: Double,
        speed: Double,
        altitudeM: Double,
        gradeLoad: Bool,
        sensitivityOffset: Double
    ) -> (watch: Double, alarm: Double, critical: Double) {
        var watch: Double
        var alarm: Double
        var critical: Double
        if let p95 = baselineP95 {
            watch = min(max(p95 + 3, profile.coolantWatchC - 4), profile.coolantWatchC + 4)
            alarm = min(max(p95 + 7, profile.coolantAlarmC - 4), profile.coolantAlarmC + 4)
            critical = profile.coolantCriticalC
        } else {
            watch = profile.coolantWatchC
            alarm = profile.coolantAlarmC
            critical = profile.coolantCriticalC
        }
        var adj = sensitivityOffset
        if let a = ambientC, a > 35 { adj += 2 }
        if normLoad > 85, speed < 20 { adj += 2 }
        if altitudeM > 1500 { adj += 2 }
        if gradeLoad { adj += 3 }
        let floor = profile.thermostatOpenC.value + 8
        let ceiling = profile.boilingCeilingC
        return (
            min(max(watch + adj, floor), ceiling),
            min(max(alarm + adj, floor), ceiling),
            min(max(critical + adj, floor), ceiling)
        )
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
        let vals = samples.map(\.1)
        guard let mn = vals.min(), let mx = vals.max(), mx - mn >= amplitude else { return 0 }
        return max(peaks / 2, mx - mn >= amplitude * 2 ? 3 : 1)
    }

    private func alarmCue() -> CareCue {
        CareCue(
            id: "overheat.alarm", text: LocalizedCare.string("overheat.alarm.voice"),
            severity: .protective, localizationKey: "overheat.alarm.voice"
        )
    }

    private func log(type: String, severity: String, value: Double, threshold: Double) {
        modelContext.insert(ProtectionEvent(
            typeRaw: type, severityRaw: severity, value: value, thresholdUsed: threshold
        ))
        try? modelContext.save()
    }
}
