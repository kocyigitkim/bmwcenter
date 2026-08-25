import Foundation
import SwiftData

@MainActor
final class TripRepository {
    private let modelContext: ModelContext
    private let settings: AppSettings

    init(modelContext: ModelContext, settings: AppSettings) {
        self.modelContext = modelContext
        self.settings = settings
    }

    func trips(in range: DateInterval) -> [Trip] {
        let descriptor = FetchDescriptor<Trip>(
            predicate: #Predicate { trip in
                trip.startedAt >= range.start && trip.startedAt < range.end
            },
            sortBy: [SortDescriptor(\.startedAt, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func todayTrips() -> [Trip] {
        let start = Calendar.current.startOfDay(for: Date())
        let end = start.addingTimeInterval(86400)
        return trips(in: DateInterval(start: start, end: end))
    }

    func weekTrips() -> [Trip] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -7, to: end) ?? end
        return trips(in: DateInterval(start: start, end: end))
    }

    func monthTrips() -> [Trip] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .month, value: -1, to: end) ?? end
        return trips(in: DateInterval(start: start, end: end))
    }

    func summary(for range: DateInterval) -> DrivingSummary {
        DrivingSummary(trips: trips(in: range), pricePerLiter: settings.pricePerLiter)
    }

    func recentTrips(limit: Int) -> [Trip] {
        var descriptor = FetchDescriptor<Trip>(sortBy: [SortDescriptor(\.startedAt, order: .reverse)])
        descriptor.fetchLimit = limit
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func scoreTrend(days: Int) -> [(Date, Double)] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: end) ?? end
        let trips = trips(in: DateInterval(start: start, end: end))
        let cal = Calendar.current
        var buckets: [Date: [Double]] = [:]
        for trip in trips {
            guard let score = trip.scoreTotal else { continue }
            let day = cal.startOfDay(for: trip.startedAt)
            buckets[day, default: []].append(score)
        }
        return buckets.keys.sorted().compactMap { day in
            guard let values = buckets[day], !values.isEmpty else { return nil }
            return (day, values.reduce(0, +) / Double(values.count))
        }
    }

    func trip(id: UUID) -> Trip? {
        let descriptor = FetchDescriptor<Trip>(predicate: #Predicate { $0.id == id })
        return try? modelContext.fetch(descriptor).first
    }

    func deleteTrip(_ id: UUID) {
        guard let trip = trip(id: id) else { return }
        modelContext.delete(trip)
        try? modelContext.save()
    }

    func setCategory(_ id: UUID, _ category: TripCategory) {
        guard let trip = trip(id: id) else { return }
        trip.category = category
        try? modelContext.save()
    }

    func deleteAll() {
        try? modelContext.delete(model: Trip.self)
        try? modelContext.delete(model: RefuelEntry.self)
        try? modelContext.delete(model: DTCRecord.self)
        try? modelContext.delete(model: DrivingEvent.self)
        try? modelContext.delete(model: CalibrationSample.self)
        try? modelContext.delete(model: FuelPricePoint.self)
        try? modelContext.delete(model: CrankRecord.self)
        try? modelContext.delete(model: AccelRecord.self)
        try? modelContext.save()
    }

    func save() {
        try? modelContext.save()
    }

    func exportCSV(range: DateInterval) -> URL? {
        CSVExporter.exportTrips(trips(in: range))
    }

    var context: ModelContext { modelContext }
}
