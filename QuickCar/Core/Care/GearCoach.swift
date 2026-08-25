import Foundation

@MainActor
final class GearCoach: CareFeature {
    let id = "gearCoach"
    let requiredPIDs: Set<UInt8> = [0x0C, 0x0D, 0x04]
    let optionalPIDs: Set<UInt8> = [0x11]

    private var ratioSamples: [Double] = []
    private var centroids: [Double] = []
    private var shiftUpSince: Date?
    private var luggingSince: Date?
    private var earlySince: Date?
    private var gearTime: [Int: Double] = [:]
    private var sweetSpotS: Double = 0
    private var totalS: Double = 0

    func isEnabled(settings: AppSettings) -> Bool { settings.careGearCoach }

    func evaluate(snapshot: VehicleSnapshot, context: inout CareContext) -> [CareCue] {
        let now = context.now
        let rpm = snapshot.rpm ?? 0
        let speed = snapshot.speedKmh ?? 0
        let load = snapshot.engineLoadPct ?? 0
        let throttle = snapshot.throttlePct ?? 0
        let diesel = context.fuelType == .diesel

        if speed > 15, load > 10, throttle > 2, throttle < 95 {
            let ratio = rpm / max(speed, 1)
            ratioSamples.append(ratio)
            if ratioSamples.count == 200 {
                centroids = Self.clusterRatios(Array(ratioSamples.prefix(200)), k: 6)
            } else if ratioSamples.count > 200, ratioSamples.count % 50 == 0 {
                centroids = Self.clusterRatios(Array(ratioSamples.suffix(200)), k: 6)
            }
        }

        let band = Self.band(diesel: diesel, eco: true)
        var cues: [CareCue] = []

        if rpm > band.upperBound, throttle < 60, speed > 20 {
            if shiftUpSince == nil { shiftUpSince = now }
            if let s = shiftUpSince, now.timeIntervalSince(s) >= 3 {
                cues.append(CareCue(
                    id: "gear.shiftUp",
                    text: LocalizedCare.string("coach.shiftUp"),
                    severity: .coach,
                    localizationKey: "coach.shiftUp"
                ))
                shiftUpSince = now.addingTimeInterval(15)
            }
        } else {
            shiftUpSince = nil
        }

        if rpm < 1300, load > 70, speed > 5 {
            if luggingSince == nil { luggingSince = now }
            if let s = luggingSince, now.timeIntervalSince(s) >= 2 {
                cues.append(CareCue(
                    id: "gear.lugging",
                    text: LocalizedCare.string("coach.shiftDown"),
                    severity: .protective,
                    localizationKey: "coach.shiftDown"
                ))
                luggingSince = now.addingTimeInterval(20)
            }
        } else {
            luggingSince = nil
        }

        if rpm < band.lowerBound, load > 55, speed > 15 {
            if earlySince == nil { earlySince = now }
            if let s = earlySince, now.timeIntervalSince(s) >= 3 {
                cues.append(CareCue(
                    id: "gear.early",
                    text: LocalizedCare.string("coach.shiftDown"),
                    severity: .coach,
                    localizationKey: "coach.shiftDown"
                ))
                earlySince = now.addingTimeInterval(20)
            }
        } else {
            earlySince = nil
        }

        if throttle > 70, rpm > band.upperBound + 400 {
            cues.append(CareCue(
                id: "gear.letShift",
                text: LocalizedCare.string("coach.letItShift"),
                severity: .coach,
                localizationKey: "coach.letItShift"
            ))
        }

        totalS += 1
        if rpm >= band.lowerBound, rpm <= band.upperBound { sweetSpotS += 1 }
        if let gear = currentGear(rpm: rpm, speed: speed) {
            gearTime[gear, default: 0] += 1
        }

        return cues
    }

    var sweetSpotRatio: Double {
        totalS > 0 ? sweetSpotS / totalS : 0
    }

    func currentGear(rpm: Double, speed: Double) -> Int? {
        guard speed > 15, !centroids.isEmpty else { return nil }
        let ratio = rpm / max(speed, 1)
        var best = 0
        var bestDist = Double.greatestFiniteMagnitude
        for (i, c) in centroids.enumerated() {
            let d = abs(c - ratio)
            if d < bestDist {
                bestDist = d
                best = i
            }
        }
        // centroids sorted high→low ratio = gear 1…6 mapped reverse
        return centroids.count - best
    }

    nonisolated static func band(diesel: Bool, eco: Bool) -> ClosedRange<Double> {
        if diesel {
            return eco ? 1500...2000 : 1500...2500
        }
        return eco ? 1800...2400 : 1800...3000
    }

    /// Simple 1D k-means for gear ratio clustering.
    nonisolated static func clusterRatios(_ samples: [Double], k: Int) -> [Double] {
        guard samples.count >= k else {
            return samples.sorted(by: >)
        }
        var centers = (0..<k).map { i in
            let idx = i * samples.count / k
            return samples.sorted()[min(idx, samples.count - 1)]
        }
        for _ in 0..<12 {
            var buckets = Array(repeating: [Double](), count: k)
            for s in samples {
                var bi = 0
                var bd = Double.greatestFiniteMagnitude
                for (i, c) in centers.enumerated() {
                    let d = abs(c - s)
                    if d < bd { bd = d; bi = i }
                }
                buckets[bi].append(s)
            }
            for i in 0..<k {
                if !buckets[i].isEmpty {
                    centers[i] = buckets[i].reduce(0, +) / Double(buckets[i].count)
                }
            }
        }
        return centers.sorted(by: >)
    }
}
