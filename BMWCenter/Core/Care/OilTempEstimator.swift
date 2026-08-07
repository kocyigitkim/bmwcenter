import Foundation

/// §3.2 oil temperature estimator with coolant anchors.
struct OilTempEstimator: Sendable {
    var tauBase: Double = 420
    var targetOil: Double = 95
    private var startedAt: Date?
    private var loadSum: Double = 0
    private var loadCount: Int = 0
    private var lastEstimate: Double?

    mutating func reset() {
        startedAt = nil
        loadSum = 0
        loadCount = 0
        lastEstimate = nil
    }

    mutating func update(
        measuredOilC: Double?,
        coolantC: Double?,
        ambientC: Double?,
        engineLoadPct: Double?,
        isRunning: Bool,
        now: Date = .now
    ) -> (tempC: Double?, isEstimated: Bool) {
        if let measured = measuredOilC {
            lastEstimate = measured
            return (measured, false)
        }
        guard isRunning else {
            return (lastEstimate, true)
        }
        if startedAt == nil { startedAt = now }
        let ambient = ambientC ?? 15
        if let load = engineLoadPct {
            loadSum += load
            loadCount += 1
        }
        let avgLoad = loadCount > 0 ? loadSum / Double(loadCount) : 40
        let ambientFactor = clamp(1.0 + (20 - ambient) * 0.018, 0.8, 1.7)
        let loadFactor = clamp(1.25 - avgLoad / 100 * 0.45, 0.8, 1.25)
        let tau = tauBase * ambientFactor * loadFactor
        let t = now.timeIntervalSince(startedAt ?? now)
        var oilEst = ambient + (targetOil - ambient) * (1 - exp(-t / max(tau, 1)))

        if let coolant = coolantC {
            if coolant > 88 {
                oilEst = min(oilEst, coolant - 4)
            }
            if coolant < 50 {
                oilEst = min(oilEst, coolant + 3)
            }
        }
        lastEstimate = oilEst
        return (oilEst, true)
    }

    /// Remaining seconds estimate to reach target readiness oil (~90°C).
    func remainingSecondsTo(target: Double = 90, ambientC: Double?) -> Double? {
        guard let startedAt, let lastEstimate else { return nil }
        let ambient = ambientC ?? 15
        guard lastEstimate < target else { return 0 }
        let ambientFactor = clamp(1.0 + (20 - ambient) * 0.018, 0.8, 1.7)
        let avgLoad = loadCount > 0 ? loadSum / Double(loadCount) : 40
        let loadFactor = clamp(1.25 - avgLoad / 100 * 0.45, 0.8, 1.25)
        let tau = tauBase * ambientFactor * loadFactor
        // Invert: target = ambient + (targetOil - ambient) * (1 - e^(-t/tau))
        let denom = targetOil - ambient
        guard denom > 1 else { return nil }
        let ratio = (target - ambient) / denom
        guard ratio > 0, ratio < 1 else { return 0 }
        let tNeeded = -tau * log(1 - ratio)
        let elapsed = Date().timeIntervalSince(startedAt)
        return max(0, tNeeded - elapsed)
    }

    private func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(max(v, lo), hi)
    }
}
