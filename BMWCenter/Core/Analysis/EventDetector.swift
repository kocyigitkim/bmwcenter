import Foundation
import CoreMotion

struct DetectedEvent: Sendable, Equatable {
    enum Kind: String, Sendable {
        case harshAccel, harshBrake, harshCorner, overspeed, overrev, longIdle, overheat
    }
    enum Severity: String, Sendable { case normal, severe }

    var kind: Kind
    var t: Date
    var severity: Severity
    var speedKmh: Double
    var magnitude: Double
}

@MainActor
final class EventDetector {
    private var speedHistory: [(Date, Double)] = []
    private var idleSince: Date?
    private var overspeedSince: Date?
    private let motion = CMMotionManager()
    private var useMotion: Bool

    init(useMotion: Bool = true) {
        self.useMotion = useMotion
        if useMotion, motion.isDeviceMotionAvailable {
            motion.deviceMotionUpdateInterval = 0.1
            motion.startDeviceMotionUpdates()
        }
    }

    func setUseMotion(_ enabled: Bool) {
        useMotion = enabled
        if !enabled { motion.stopDeviceMotionUpdates() }
        else if motion.isDeviceMotionAvailable {
            motion.deviceMotionUpdateInterval = 0.1
            motion.startDeviceMotionUpdates()
        }
    }

    func evaluate(snapshot: VehicleSnapshot, now: Date = .now) -> [DetectedEvent] {
        var events: [DetectedEvent] = []
        let speed = snapshot.speedKmh ?? 0
        let rpm = snapshot.rpm ?? 0
        speedHistory.append((now, speed))
        if speedHistory.count > 3 { speedHistory.removeFirst(speedHistory.count - 3) }

        if speedHistory.count == 3 {
            let v0 = speedHistory[0].1 / 3.6
            let v2 = speedHistory[2].1 / 3.6
            let dt = speedHistory[2].0.timeIntervalSince(speedHistory[0].0)
            if dt > 0 {
                let a = (v2 - v0) / dt
                if a > 2.5 {
                    events.append(.init(kind: .harshAccel, t: now, severity: a > 3.5 ? .severe : .normal, speedKmh: speed, magnitude: a))
                }
                if a < -3.0 {
                    events.append(.init(kind: .harshBrake, t: now, severity: a < -4.5 ? .severe : .normal, speedKmh: speed, magnitude: a))
                }
            }
        }

        if useMotion, let dm = motion.deviceMotion {
            let lateral = abs(dm.userAcceleration.x)
            if lateral > 0.35 {
                events.append(.init(kind: .harshCorner, t: now, severity: lateral > 0.5 ? .severe : .normal, speedKmh: speed, magnitude: lateral))
            }
        }

        if rpm > 4500, (snapshot.coolantC ?? 99) < 70 {
            events.append(.init(kind: .overrev, t: now, severity: .normal, speedKmh: speed, magnitude: rpm))
        }

        if speed > 130 {
            if overspeedSince == nil { overspeedSince = now }
            if let since = overspeedSince, now.timeIntervalSince(since) >= 10 {
                events.append(.init(kind: .overspeed, t: now, severity: .normal, speedKmh: speed, magnitude: speed))
            }
        } else {
            overspeedSince = nil
        }

        if speed < 2, rpm > 300 {
            if idleSince == nil { idleSince = now }
            if let since = idleSince, now.timeIntervalSince(since) >= 180 {
                events.append(.init(kind: .longIdle, t: now, severity: .normal, speedKmh: speed, magnitude: now.timeIntervalSince(since)))
                idleSince = now
            }
        } else {
            idleSince = nil
        }

        if let coolant = snapshot.coolantC, coolant > 105 {
            events.append(.init(kind: .overheat, t: now, severity: coolant > 115 ? .severe : .normal, speedKmh: speed, magnitude: coolant))
        }
        return events
    }
}
