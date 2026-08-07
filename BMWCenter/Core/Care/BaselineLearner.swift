import Foundation
import SwiftData

/// Online Welford mean/variance + 128-bin histogram for P50/P95.
@MainActor
final class BaselineLearner {
    static let histogramBins = 128
    static let halfLifeDays: Double = 60

    private let modelContext: ModelContext
    private var cache: [String: BaselineMetric] = [:]
    private var histograms: [String: [Int]] = [:]

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
        warmCache()
    }

    func warmCache() {
        let rows = (try? modelContext.fetch(FetchDescriptor<BaselineMetric>())) ?? []
        cache.removeAll()
        histograms.removeAll()
        for row in rows {
            let k = compositeKey(row.key, row.bucketKey)
            cache[k] = row
            if let data = row.histogramData,
               let bins = try? JSONDecoder().decode([Int].self, from: data),
               bins.count == Self.histogramBins {
                histograms[k] = bins
            } else {
                histograms[k] = Array(repeating: 0, count: Self.histogramBins)
            }
        }
    }

    func observe(
        key: String,
        value: Double,
        bucketKey: String = "",
        minSamples: Int = 60,
        range: ClosedRange<Double> = -50...200,
        now: Date = .now
    ) {
        let ck = compositeKey(key, bucketKey)
        let metric = cache[ck] ?? {
            let m = BaselineMetric(key: key, bucketKey: bucketKey)
            modelContext.insert(m)
            cache[ck] = m
            histograms[ck] = Array(repeating: 0, count: Self.histogramBins)
            return m
        }()

        applyForgetting(metric: metric, now: now)

        metric.count += 1
        let delta = value - metric.mean
        metric.mean += delta / Double(metric.count)
        let delta2 = value - metric.mean
        metric.m2 += delta * delta2
        metric.lastUpdated = now

        var bins = histograms[ck] ?? Array(repeating: 0, count: Self.histogramBins)
        let clamped = min(max(value, range.lowerBound), range.upperBound)
        let span = range.upperBound - range.lowerBound
        let idx = min(Self.histogramBins - 1, max(0, Int((clamped - range.lowerBound) / span * Double(Self.histogramBins))))
        bins[idx] += 1
        histograms[ck] = bins
        metric.histogramData = try? JSONEncoder().encode(bins)

        let (p50, p95) = percentiles(bins: bins, range: range)
        metric.p50 = p50
        metric.p95 = p95
        metric.isMature = metric.count >= minSamples
        try? modelContext.save()
    }

    func snapshot(key: String, bucketKey: String = "") -> BaselineMetric? {
        cache[compositeKey(key, bucketKey)]
    }

    func isMature(key: String, bucketKey: String = "", minSamples: Int = 60) -> Bool {
        guard let m = snapshot(key: key, bucketKey: bucketKey) else { return false }
        return m.count >= minSamples
    }

    func reset(keyPrefix: String? = nil) {
        let rows = (try? modelContext.fetch(FetchDescriptor<BaselineMetric>())) ?? []
        for row in rows {
            if let keyPrefix, !row.key.hasPrefix(keyPrefix) { continue }
            modelContext.delete(row)
            let ck = compositeKey(row.key, row.bucketKey)
            cache.removeValue(forKey: ck)
            histograms.removeValue(forKey: ck)
        }
        try? modelContext.save()
    }

    /// Pure helper for tests — update in-memory Welford + histogram.
    nonisolated static func updateOnline(
        count: inout Int,
        mean: inout Double,
        m2: inout Double,
        bins: inout [Int],
        value: Double,
        range: ClosedRange<Double>
    ) {
        count += 1
        let delta = value - mean
        mean += delta / Double(count)
        let delta2 = value - mean
        m2 += delta * delta2
        if bins.count != histogramBins {
            bins = Array(repeating: 0, count: histogramBins)
        }
        let clamped = min(max(value, range.lowerBound), range.upperBound)
        let span = range.upperBound - range.lowerBound
        let idx = min(histogramBins - 1, max(0, Int((clamped - range.lowerBound) / span * Double(histogramBins))))
        bins[idx] += 1
    }

    nonisolated static func percentiles(bins: [Int], range: ClosedRange<Double>) -> (p50: Double, p95: Double) {
        let total = bins.reduce(0, +)
        guard total > 0 else { return (0, 0) }
        let span = range.upperBound - range.lowerBound
        func value(atQuantile q: Double) -> Double {
            let target = Double(total) * q
            var acc = 0
            for (i, c) in bins.enumerated() {
                acc += c
                if Double(acc) >= target {
                    return range.lowerBound + (Double(i) + 0.5) / Double(histogramBins) * span
                }
            }
            return range.upperBound
        }
        return (value(atQuantile: 0.50), value(atQuantile: 0.95))
    }

    private func percentiles(bins: [Int], range: ClosedRange<Double>) -> (Double, Double) {
        Self.percentiles(bins: bins, range: range)
    }

    private func applyForgetting(metric: BaselineMetric, now: Date) {
        let ageDays = now.timeIntervalSince(metric.lastUpdated) / 86_400
        guard ageDays > 1, metric.count > 0 else { return }
        // Exponential half-life: weight decays toward 0.5 after ~60 days of inactivity on the series.
        let weight = pow(0.5, ageDays / Self.halfLifeDays)
        if weight < 0.99 {
            let newCount = max(1, Int(Double(metric.count) * weight))
            metric.m2 *= weight
            metric.count = newCount
        }
    }

    private func compositeKey(_ key: String, _ bucket: String) -> String {
        bucket.isEmpty ? key : "\(key)|\(bucket)"
    }
}
