import Foundation

enum AccelConfidence: String, Sendable {
    case low, normal
}

struct AccelResult: Sendable, Equatable {
    var t0to100: Double?
    var t0to60: Double?
    var t80to120: Double?
    var sampleRateHz: Double
    var confidence: AccelConfidence
}

@MainActor
final class AccelTestRunner {
    private let sampleProvider: () -> AsyncStream<(Date, Double)>
    private let stopSampling: () -> Void

    init(
        sampleProvider: @escaping () -> AsyncStream<(Date, Double)>,
        stopSampling: @escaping () -> Void
    ) {
        self.sampleProvider = sampleProvider
        self.stopSampling = stopSampling
    }

    /// Requires vehicle at rest (`speed == 0`) before calling.
    func run(timeoutS: TimeInterval = 30) async -> AccelResult {
        let stream = sampleProvider()
        var samples: [(Date, Double)] = []
        let begun = Date()
        for await sample in stream {
            samples.append(sample)
            if let last = samples.last, last.1 >= 120 { break }
            if Date().timeIntervalSince(begun) > timeoutS { break }
        }
        stopSampling()
        return Self.compute(samples: samples)
    }

    static func compute(samples: [(Date, Double)]) -> AccelResult {
        guard samples.count >= 2 else {
            return AccelResult(t0to100: nil, t0to60: nil, t80to120: nil, sampleRateHz: 0, confidence: .low)
        }
        let duration = samples.last!.0.timeIntervalSince(samples.first!.0)
        let rate = duration > 0 ? Double(samples.count - 1) / duration : 0
        let confidence: AccelConfidence = rate < 6 ? .low : .normal

        guard let startIdx = samples.firstIndex(where: { $0.1 > 0 }) else {
            return AccelResult(t0to100: nil, t0to60: nil, t80to120: nil, sampleRateHz: rate, confidence: confidence)
        }
        let t0 = samples[startIdx].0

        func timeTo(_ target: Double) -> Double? {
            interpolateCrossing(samples: Array(samples[startIdx...]), target: target, t0: t0)
        }

        let t0to60 = timeTo(60)
        let t0to100 = timeTo(100)

        var t80to120: Double?
        if let i80 = firstCrossingIndex(samples: Array(samples[startIdx...]), target: 80) {
            let from80 = Array(samples[startIdx...].dropFirst(i80))
            if let t120 = interpolateCrossing(samples: from80, target: 120, t0: from80[0].0) {
                t80to120 = t120
            }
        }

        return AccelResult(
            t0to100: t0to100,
            t0to60: t0to60,
            t80to120: t80to120,
            sampleRateHz: rate,
            confidence: confidence
        )
    }

    private static func firstCrossingIndex(samples: [(Date, Double)], target: Double) -> Int? {
        for i in 1..<samples.count {
            if samples[i - 1].1 < target, samples[i].1 >= target { return i - 1 }
        }
        return nil
    }

    private static func interpolateCrossing(
        samples: [(Date, Double)],
        target: Double,
        t0: Date
    ) -> Double? {
        for i in 1..<samples.count {
            let (tPrev, vPrev) = samples[i - 1]
            let (tCurr, vCurr) = samples[i]
            if vPrev < target, vCurr >= target {
                let span = vCurr - vPrev
                let ratio = span > 0 ? (target - vPrev) / span : 1
                let crossing = tPrev.addingTimeInterval(tCurr.timeIntervalSince(tPrev) * ratio)
                return crossing.timeIntervalSince(t0)
            }
        }
        return nil
    }
}
