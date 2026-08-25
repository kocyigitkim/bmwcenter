import Foundation

@MainActor
final class EngineReadyService: CareFeature {
    let id = "engineReady"
    let requiredPIDs: Set<UInt8> = [0x05]
    let optionalPIDs: Set<UInt8> = [0x5C, 0x1F, 0x46]

    private(set) var readiness: Double = 0
    private(set) var isReady = false
    private(set) var remainingLabel: String?
    private var loadHistory: [(Date, Double)] = []
    private var celebrated = false
    private var lastRemainingUpdate = Date.distantPast
    private var remainingS: Double?

    func isEnabled(settings: AppSettings) -> Bool { true }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let ambient = context.ambientC ?? snapshot.ambientC ?? 15
        let coolant = snapshot.coolantC ?? ambient
        let oil = context.oilTempC ?? coolant
        let runtime = snapshot.runtimeS ?? 0
        let now = context.now

        if let load = snapshot.engineLoadPct {
            loadHistory.append((now, load))
            loadHistory = loadHistory.filter { now.timeIntervalSince($0.0) <= 180 }
        }
        let avgLoad = loadHistory.isEmpty
            ? 0
            : loadHistory.map(\.1).reduce(0, +) / Double(loadHistory.count)

        let coolDenom = max(88 - ambient, 1)
        let oilDenom = max(90 - ambient, 1)
        let coolantProgress = clamp((coolant - ambient) / coolDenom, 0, 1)
        let oilProgress = clamp((oil - ambient) / oilDenom, 0, 1)
        let runtimeProgress = clamp(runtime / 480, 0, 1)
        let loadHistoryProgress = clamp(avgLoad / 45, 0, 1)

        var r = 0.45 * coolantProgress
            + 0.40 * oilProgress
            + 0.10 * runtimeProgress
            + 0.05 * loadHistoryProgress

        if isReady {
            r = max(r, 0.98)
        }
        readiness = r
        context.readiness = r

        if r >= 0.98 {
            isReady = true
            context.engineReady = true
            remainingLabel = LocalizedCare.string("ready.reached")
        } else {
            context.engineReady = false
            if now.timeIntervalSince(lastRemainingUpdate) >= 10 {
                lastRemainingUpdate = now
                let estimate = Self.estimateRemaining(
                    readiness: r,
                    runtimeS: runtime
                )
                if let prev = remainingS {
                    remainingS = min(prev, estimate)
                } else {
                    remainingS = estimate
                }
            }
            if let rem = remainingS {
                let mins = max(1, Int(ceil(rem / 60)))
                remainingLabel = LocalizedCare.string("ready.remaining", "\(mins) min")
            }
        }

        var cues: [CareCue] = []
        if isReady, !celebrated {
            celebrated = true
            cues.append(CareCue(
                id: "ready.reached",
                text: LocalizedCare.string("ready.reached"),
                severity: .celebration,
                localizationKey: "ready.reached"
            ))
        }
        return cues
    }

    func resetTrip() {
        readiness = 0
        isReady = false
        remainingLabel = nil
        loadHistory.removeAll()
        celebrated = false
        remainingS = nil
    }

    nonisolated static func computeReadiness(
        coolantC: Double,
        oilC: Double,
        ambientC: Double,
        runtimeS: Double,
        avgLoad3min: Double
    ) -> Double {
        let coolDenom = max(88 - ambientC, 1)
        let oilDenom = max(90 - ambientC, 1)
        let coolantProgress = min(max((coolantC - ambientC) / coolDenom, 0), 1)
        let oilProgress = min(max((oilC - ambientC) / oilDenom, 0), 1)
        let runtimeProgress = min(max(runtimeS / 480, 0), 1)
        let loadHistoryProgress = min(max(avgLoad3min / 45, 0), 1)
        return 0.45 * coolantProgress
            + 0.40 * oilProgress
            + 0.10 * runtimeProgress
            + 0.05 * loadHistoryProgress
    }

    private static func estimateRemaining(readiness: Double, runtimeS: Double) -> Double {
        let remainingFrac = max(0, 1 - readiness)
        return remainingFrac * max(60, 480 - runtimeS)
    }

    private func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
        min(max(v, lo), hi)
    }
}
