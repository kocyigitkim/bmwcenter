import Foundation

/// Her Care modülünün önüne konan ortak sinyal doğrulama katmanı (Kural Seti v2 §2).
/// PID desteği zaten `CareFeature.isAvailable` ile filtreleniyor; burada donuk sinyal,
/// sensör-default değer, CAN kopması ve load/ambient normalize işlenir.
@MainActor
final class SignalGate {
    static let stuckWindowS: TimeInterval = 30
    static let canDropoutS: TimeInterval = 2
    private static let sensorDefaults: Set<Double> = [-40, 0, 215]

    struct Result: Sendable {
        var canHealthy: Bool = true
        var normLoad: Double?
        var effectiveAmbientC: Double?
        var regenActive: Bool = false
    }

    private var lastRawValue: [String: Double] = [:]
    private var lastChangeAt: [String: Date] = [:]
    private var lastSnapshotAt: Date?
    private var peakAbsoluteLoad: Double = 100

    /// True if `now - lastSnapshotAt > canDropoutS`. Callers should reset their own
    /// streak counters when this flips false→true so a bus glitch can't fake a "sürekli ≥Ns" streak.
    func evaluate(snapshot: VehicleSnapshot, profile: VehicleDiagnosticProfile, now: Date) -> Result {
        var result = Result()

        if let last = lastSnapshotAt, now.timeIntervalSince(last) > Self.canDropoutS {
            result.canHealthy = false
        }
        lastSnapshotAt = now

        if let c = snapshot.coolantC { trackStuck(key: "coolant", value: c, now: now) }
        if let v = snapshot.voltage { trackStuck(key: "voltage", value: v, now: now) }

        if let load = snapshot.engineLoadPct {
            if profile.aspiration != .na {
                peakAbsoluteLoad = max(peakAbsoluteLoad, load)
                result.normLoad = load / max(1, peakAbsoluteLoad) * 100
            } else {
                result.normLoad = min(load, 100)
            }
        }

        if let amb = snapshot.ambientC {
            result.effectiveAmbientC = amb
        } else if let iat = snapshot.intakeAirC, (snapshot.speedKmh ?? 0) > 40 {
            result.effectiveAmbientC = iat
        }

        if profile.hasDPF, let cat = snapshot.catalystC, cat > 550 {
            result.regenActive = true
        }

        return result
    }

    /// Rejects an implausible sample: sensor default value, or unchanged for `stuckWindowS`.
    func isValid(key: String, value: Double, now: Date) -> Bool {
        if Self.sensorDefaults.contains(value) { return false }
        if let changedAt = lastChangeAt[key], now.timeIntervalSince(changedAt) > Self.stuckWindowS {
            return false
        }
        return true
    }

    private func trackStuck(key: String, value: Double, now: Date) {
        if lastRawValue[key] != value {
            lastChangeAt[key] = now
        }
        lastRawValue[key] = value
    }
}
