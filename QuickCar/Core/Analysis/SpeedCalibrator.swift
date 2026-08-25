import Foundation
import CoreLocation

@MainActor
final class SpeedCalibrator {
    private var samples: [Double] = []
    private var recentOBD: [(Date, Double)] = []
    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
    }

    func ingest(obdSpeedKmh: Double, location: CLLocation?, now: Date = .now) {
        recentOBD.append((now, obdSpeedKmh))
        if recentOBD.count > 20 { recentOBD.removeFirst(recentOBD.count - 20) }
        guard let location, location.horizontalAccuracy > 0, location.horizontalAccuracy < 10 else { return }
        guard obdSpeedKmh > 50 else { return }
        let window = recentOBD.filter { now.timeIntervalSince($0.0) <= 5 }
        guard window.count >= 2 else { return }
        let speeds = window.map(\.1)
        guard (speeds.max()! - speeds.min()!) < 2 else { return }
        let gps = location.speed >= 0 ? location.speed * 3.6 : 0
        guard abs(obdSpeedKmh - gps) < 15, gps > 0 else { return }
        samples.append(gps / obdSpeedKmh)
        if samples.count >= 60 {
            let median = Self.median(samples)
            settings.speedCalibrationFactor = min(max(median, 0.85), 1.10)
        }
    }

    func reset() {
        samples.removeAll()
        settings.speedCalibrationFactor = 1.0
    }

    var sampleCount: Int { samples.count }

    nonisolated static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let mid = sorted.count / 2
        if sorted.count % 2 == 0 {
            return (sorted[mid - 1] + sorted[mid]) / 2
        }
        return sorted[mid]
    }
}
