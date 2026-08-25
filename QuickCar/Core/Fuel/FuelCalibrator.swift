import Foundation
import SwiftData

@MainActor
final class FuelCalibrator {
    private let fuelRepository: FuelRepository
    private let tripRepository: TripRepository
    private let settings: AppSettings

    init(fuelRepository: FuelRepository, tripRepository: TripRepository, settings: AppSettings) {
        self.fuelRepository = fuelRepository
        self.tripRepository = tripRepository
        self.settings = settings
    }

    var acceptedSampleCount: Int {
        fuelRepository.calibrationSamples().filter(\.accepted).count
    }

    func evaluateLatestFullTankPair() {
        guard let (first, second) = fuelRepository.lastFullTankPair() else { return }
        let range = DateInterval(start: first.date, end: second.date)
        let trips = tripRepository.trips(in: range)
        let calculatedL = trips.reduce(0) { $0 + $1.fuelUsedL }
        let distanceKm = trips.reduce(0) { $0 + $1.distanceKm }
        let measuredL = second.liters
        guard calculatedL > 15, distanceKm > 150 else {
            insertSample(measuredL, calculatedL, distanceKm, accepted: false)
            return
        }
        let raw = measuredL / calculatedL
        guard raw >= 0.6, raw <= 1.6 else {
            insertSample(measuredL, calculatedL, distanceKm, rawFactor: raw, accepted: false)
            return
        }
        insertSample(measuredL, calculatedL, distanceKm, rawFactor: raw, accepted: true)
        let accepted = fuelRepository.calibrationSamples().filter(\.accepted)
        guard accepted.count >= 2 else { return }
        var factor = settings.fuelCalibrationFactor
        factor = factor * (1 - 0.35) + raw * 0.35
        factor = min(max(factor, 0.7), 1.4)
        settings.fuelCalibrationFactor = factor
    }

    func reset() {
        settings.fuelCalibrationFactor = 1.0
        for sample in fuelRepository.calibrationSamples() {
            fuelRepository.context.delete(sample)
        }
        fuelRepository.save()
    }

    private func insertSample(
        _ measuredL: Double,
        _ calculatedL: Double,
        _ distanceKm: Double,
        rawFactor: Double? = nil,
        accepted: Bool
    ) {
        let raw = rawFactor ?? (calculatedL > 0 ? measuredL / calculatedL : 0)
        fuelRepository.context.insert(
            CalibrationSample(
                measuredL: measuredL,
                calculatedL: calculatedL,
                distanceKm: distanceKm,
                rawFactor: raw,
                accepted: accepted
            )
        )
        fuelRepository.save()
    }
}
