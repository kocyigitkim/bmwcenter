import Foundation
import SwiftData

@MainActor
final class FuelTrimMonitor: CareFeature {
    let id = "fuelTrim"
    let requiredPIDs: Set<UInt8> = [0x06, 0x07]
    let optionalPIDs: Set<UInt8> = [0x08, 0x09]

    private let baseline: BaselineLearner
    private let modelContext: ModelContext

    private struct BandHit: Sendable {
        var tripIDs: Set<UUID> = []
        var durationS: Double = 0
        var leanOrRich: String?
    }

    private var sessionHits: [String: BandHit] = [:]
    private var bandAccum: [String: (sum: Double, n: Int)] = [:]

    init(baseline: BaselineLearner, modelContext: ModelContext) {
        self.baseline = baseline
        self.modelContext = modelContext
    }

    func isEnabled(settings: AppSettings) -> Bool { settings.careFuelTrimMonitor }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        guard let ltft = snapshot.ltftBank1 else { return [] }
        let stft = snapshot.stftBank1 ?? 0
        let total = ltft + stft
        let coolant = snapshot.coolantC ?? 0
        let fuel = snapshot.fuelLevelPct ?? 100
        let load = snapshot.engineLoadPct ?? 0
        let speed = snapshot.speedKmh ?? 0

        if let refuel = context.lastRefuelAt,
           context.now.timeIntervalSince(refuel) < 600 {
            return []
        }
        guard coolant > 80, fuel > 15 else { return [] }

        let band: String
        switch (speed, load) {
        case (...3, ...25): band = "idle"
        case (_, 25...65): band = "part"
        case (_, 65...): band = "high"
        default: return []
        }

        baseline.observe(
            key: "ltft.\(band)",
            value: total,
            bucketKey: "",
            minSamples: 60,
            range: -40...40,
            now: context.now
        )
        var acc = bandAccum[band] ?? (0, 0)
        acc.sum += total
        acc.n += 1
        bandAccum[band] = acc

        return []
    }

    func onTripEnded(trip: Trip, context: CareContext) -> [CareCue] {
        defer { bandAccum.removeAll() }
        guard trip.durationS >= 60 else { return [] }

        let idleAvg = avg("idle")
        let partAvg = avg("part")
        let highAvg = avg("high")

        var pattern: String?
        if let idle = idleAvg, idle > 12, (partAvg ?? 0) < 12, (highAvg ?? 0) < 12 {
            pattern = "lean_idle"
        } else if let idle = idleAvg, idle > 12, (partAvg ?? 0) > 12 {
            pattern = "lean_all"
        } else if let high = highAvg, high > 15, (idleAvg ?? 0) < 12 {
            pattern = "lean_high"
        } else if let idle = idleAvg, idle < -12, (partAvg ?? 0) < -12 {
            pattern = "rich_all"
        }

        // Bank imbalance
        // (snapshot not available at trip end — skip live bank check here)

        guard let pattern else { return [] }

        var hit = sessionHits[pattern] ?? BandHit()
        hit.tripIDs.insert(trip.id)
        hit.durationS += trip.durationS
        hit.leanOrRich = pattern.contains("rich") ? "rich" : "lean"
        sessionHits[pattern] = hit

        guard hit.tripIDs.count >= 3, hit.durationS >= 20 * 60 else { return [] }

        modelContext.insert(ProtectionEvent(
            typeRaw: "fuelTrim",
            severityRaw: "alarm",
            value: idleAvg ?? partAvg ?? highAvg ?? 0,
            thresholdUsed: 12
        ))
        try? modelContext.save()

        let drifting = LocalizedCare.string("trim.drifting")
        return [CareCue(
            id: "trim.drift",
            text: drifting,
            severity: .coach,
            localizationKey: "trim.drifting"
        )]
    }

    nonisolated static func validateAlert(tripCount: Int, durationS: Double, postRefuelS: Double) -> Bool {
        tripCount >= 3 && durationS >= 20 * 60 && postRefuelS >= 600
    }

    private func avg(_ band: String) -> Double? {
        guard let acc = bandAccum[band], acc.n > 0 else { return nil }
        return acc.sum / Double(acc.n)
    }
}
