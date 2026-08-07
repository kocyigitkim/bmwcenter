import Foundation

@MainActor
final class EcoCoach: CareFeature {
    let id = "ecoCoach"
    let requiredPIDs: Set<UInt8> = [0x0D, 0x0C]
    let optionalPIDs: Set<UInt8> = [0x10, 0x5E, 0x11]

    private var speedHistory: [(Date, Double)] = []
    private var accelStreakStart: Date?
    private var highRevCruiseStart: Date?
    private var lastThrottleOpenAt: Date?
    private var coastCandidateStart: Date?
    private var overrunStart: Date?
    private var idleSince: Date?
    private var highSpeedSince: Date?
    private var stopCountWindow: [(Date, Bool)] = []
    private var wasStopped = false
    private var warningCount = 0
    private var scoreWindow: [(Date, Double)] = []

    private(set) var liveScore: Double = 100

    func isEnabled(settings: AppSettings) -> Bool { settings.careEcoCoach }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        guard !context.isColdPhase else {
            context.liveEcoScore = liveScore
            return []
        }

        let now = context.now
        let speed = snapshot.speedKmh ?? 0
        let rpm = snapshot.rpm ?? 0
        let throttle = snapshot.throttlePct ?? 0
        let fuel = snapshot.engineFuelRateLh ?? 0

        speedHistory.append((now, speed))
        speedHistory = speedHistory.filter { now.timeIntervalSince($0.0) <= 60 }

        // Acceleration from speed delta
        var accel = 0.0
        if speedHistory.count >= 2 {
            let a = speedHistory[speedHistory.count - 2]
            let b = speedHistory[speedHistory.count - 1]
            let dt = b.0.timeIntervalSince(a.0)
            if dt > 0 {
                accel = ((b.1 - a.1) / 3.6) / dt
            }
        }

        let stopped = speed < 2
        if stopped, !wasStopped {
            stopCountWindow.append((now, true))
        }
        wasStopped = stopped
        stopCountWindow = stopCountWindow.filter { now.timeIntervalSince($0.0) <= 300 }
        let avgSpeed5m: Double = {
            let w = speedHistory // reuse 60s; approximate with recent
            let longer = speedHistory
            return longer.isEmpty ? speed : longer.map(\.1).reduce(0, +) / Double(longer.count)
        }()
        // City traffic: use stop count + low speed heuristic over rolling buffer
        context.isCityTraffic = stopCountWindow.count >= 8 && avgSpeed5m < 15

        var cues: [CareCue] = []
        func warn(_ cue: CareCue) {
            warningCount += 1
            cues.append(cue)
            scoreWindow.append((now, -8))
        }

        // Hard accel
        if accel > 2.2 {
            if accelStreakStart == nil { accelStreakStart = now }
            if let s = accelStreakStart, now.timeIntervalSince(s) >= 1.5 {
                warn(CareCue(id: "coach.easeOff", text: LocalizedCare.string("coach.easeOff"), severity: .coach, localizationKey: "coach.easeOff"))
                accelStreakStart = now.addingTimeInterval(5)
            }
        } else {
            accelStreakStart = nil
        }

        if !context.isCityTraffic {
            let speedStable = speedHistory.count >= 4
                && (speedHistory.map(\.1).max()! - speedHistory.map(\.1).min()!) < 3
            if rpm > 2800, speedStable, speed > 20 {
                if highRevCruiseStart == nil { highRevCruiseStart = now }
                if let s = highRevCruiseStart, now.timeIntervalSince(s) >= 8 {
                    warn(CareCue(id: "coach.shiftUp", text: LocalizedCare.string("coach.shiftUp"), severity: .coach, localizationKey: "coach.shiftUp"))
                    highRevCruiseStart = now.addingTimeInterval(20)
                }
            } else {
                highRevCruiseStart = nil
            }
        }

        if throttle > 5 { lastThrottleOpenAt = now }
        if accel < -2.8 {
            if let open = lastThrottleOpenAt, now.timeIntervalSince(open) < 5 {
                warn(CareCue(id: "coach.liftEarlier", text: LocalizedCare.string("coach.liftEarlier"), severity: .coach, localizationKey: "coach.liftEarlier"))
                lastThrottleOpenAt = nil
            }
        }

        if speed > 25, throttle < 2, fuel < 0.15, accel < 0 {
            if coastCandidateStart == nil { coastCandidateStart = now }
            // Missed coast if throttle was open while decelerating with fuel
        } else if speed > 25, throttle > 5, accel < -0.5, fuel > 0.5 {
            warn(CareCue(id: "coach.coast", text: LocalizedCare.string("coach.coast"), severity: .coach, localizationKey: "coach.coast"))
        } else {
            coastCandidateStart = nil
        }

        // Overrun reward
        if speed > 25, throttle < 2, fuel < 0.1 {
            if overrunStart == nil { overrunStart = now }
            if let s = overrunStart, now.timeIntervalSince(s) >= 4 {
                cues.append(CareCue(id: "coach.nice", text: LocalizedCare.string("coach.nice"), severity: .celebration, localizationKey: "coach.nice"))
                scoreWindow.append((now, 6))
                overrunStart = now.addingTimeInterval(30)
            }
        } else {
            overrunStart = nil
        }

        if !context.isCityTraffic, speed > 70 {
            let osc = Self.speedOscillations(speedHistory, amplitude: 8)
            if osc >= 4 {
                warn(CareCue(id: "coach.steady", text: LocalizedCare.string("coach.steadySpeed"), severity: .coach, localizationKey: "coach.steadySpeed"))
            }
        }

        if speed < 2, rpm > 300 {
            if idleSince == nil { idleSince = now }
            if let s = idleSince, now.timeIntervalSince(s) > 180 {
                warn(CareCue(id: "coach.longIdle", text: LocalizedCare.string("coach.longIdle"), severity: .coach, localizationKey: "coach.longIdle"))
                idleSince = now.addingTimeInterval(300)
            }
        } else {
            idleSince = nil
        }

        if !context.isCityTraffic {
            if speed > 120 {
                if highSpeedSince == nil { highSpeedSince = now }
                if let s = highSpeedSince, now.timeIntervalSince(s) >= 20 {
                    warn(CareCue(id: "coach.highSpeed", text: LocalizedCare.string("coach.highSpeed"), severity: .coach, localizationKey: "coach.highSpeed"))
                    highSpeedSince = now.addingTimeInterval(60)
                }
            } else {
                highSpeedSince = nil
            }
        }

        updateLiveScore(now: now)
        context.liveEcoScore = liveScore
        return cues
    }

    private func updateLiveScore(now: Date) {
        scoreWindow = scoreWindow.filter { now.timeIntervalSince($0.0) <= 30 }
        let delta = scoreWindow.map(\.1).reduce(0, +)
        liveScore = min(100, max(0, 100 + delta))
    }

    static func speedOscillations(_ history: [(Date, Double)], amplitude: Double) -> Int {
        guard history.count >= 6 else { return 0 }
        var crossings = 0
        let mean = history.map(\.1).reduce(0, +) / Double(history.count)
        var above = history[0].1 > mean
        for s in history.dropFirst() {
            let nowAbove = s.1 > mean + amplitude / 2
            let nowBelow = s.1 < mean - amplitude / 2
            if above, nowBelow { crossings += 1; above = false }
            if !above, nowAbove { crossings += 1; above = true }
        }
        return crossings
    }

    func resetTrip() {
        speedHistory.removeAll()
        warningCount = 0
        liveScore = 100
        scoreWindow.removeAll()
    }
}
