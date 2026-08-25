import Foundation
import SwiftData

@MainActor
final class FuelStatistics {
    private let modelContext: ModelContext
    private let settings: AppSettings

    init(modelContext: ModelContext, settings: AppSettings) {
        self.modelContext = modelContext
        self.settings = settings
    }

    func summary(for range: DateInterval) -> DrivingSummary {
        let descriptor = FetchDescriptor<Trip>(
            predicate: #Predicate { trip in
                trip.startedAt >= range.start && trip.startedAt < range.end
            }
        )
        let trips = (try? modelContext.fetch(descriptor)) ?? []
        return DrivingSummary(trips: trips, pricePerLiter: settings.pricePerLiter)
    }

    func dailyFuel(lastDays: Int = 14) -> [(date: Date, liters: Double)] {
        let calendar = Calendar.current
        let end = calendar.startOfDay(for: Date()).addingTimeInterval(86400)
        guard let start = calendar.date(byAdding: .day, value: -lastDays, to: end) else { return [] }
        let descriptor = FetchDescriptor<Trip>(
            predicate: #Predicate { trip in
                trip.startedAt >= start && trip.startedAt < end
            }
        )
        let trips = (try? modelContext.fetch(descriptor)) ?? []
        var buckets: [Date: Double] = [:]
        for trip in trips {
            let day = calendar.startOfDay(for: trip.startedAt)
            buckets[day, default: 0] += trip.fuelUsedL
        }
        return (0..<lastDays).compactMap { offset in
            guard let day = calendar.date(byAdding: .day, value: -(lastDays - 1 - offset), to: calendar.startOfDay(for: Date())) else { return nil }
            return (day, buckets[day] ?? 0)
        }
    }

    func lastRefuel() -> RefuelEntry? {
        var descriptor = FetchDescriptor<RefuelEntry>(sortBy: [SortDescriptor(\.date, order: .reverse)])
        descriptor.fetchLimit = 1
        return try? modelContext.fetch(descriptor).first
    }

    func measuredVsEstimated() -> (measured: Double?, estimated: Double?) {
        var descriptor = FetchDescriptor<RefuelEntry>(
            predicate: #Predicate { $0.isFullTank },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        descriptor.fetchLimit = 2
        let fulls = (try? modelContext.fetch(descriptor)) ?? []
        guard fulls.count >= 2,
              let odoNew = fulls[0].odometerKm,
              let odoOld = fulls[1].odometerKm,
              odoNew > odoOld else {
            return (nil, nil)
        }
        let delta = odoNew - odoOld
        let measured = fulls[0].liters / delta * 100
        let range = DateInterval(start: fulls[1].date, end: fulls[0].date)
        let estimated = summary(for: range).avgL100
        return (measured, estimated > 0 ? estimated : nil)
    }
}
