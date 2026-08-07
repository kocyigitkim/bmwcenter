import Foundation
import SwiftData

@MainActor
final class FuelRepository {
    private let modelContext: ModelContext

    init(modelContext: ModelContext) {
        self.modelContext = modelContext
    }

    func refuels(in range: DateInterval) -> [RefuelEntry] {
        let descriptor = FetchDescriptor<RefuelEntry>(
            predicate: #Predicate { entry in
                entry.date >= range.start && entry.date < range.end
            },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func allRefuels() -> [RefuelEntry] {
        let descriptor = FetchDescriptor<RefuelEntry>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func lastFullTankPair() -> (RefuelEntry, RefuelEntry)? {
        let descriptor = FetchDescriptor<RefuelEntry>(
            predicate: #Predicate { $0.isFullTank == true },
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        let fulls = (try? modelContext.fetch(descriptor)) ?? []
        guard fulls.count >= 2 else { return nil }
        return (fulls[1], fulls[0])
    }

    func measuredConsumption(tripRepository: TripRepository) -> Double? {
        guard let (first, second) = lastFullTankPair() else { return nil }
        let range = DateInterval(start: first.date, end: second.date)
        let trips = tripRepository.trips(in: range)
        let distance = trips.reduce(0) { $0 + $1.distanceKm }
        guard distance > 0.1, second.liters > 0 else { return nil }
        let v = second.liters / distance * 100
        return FuelCalculator.isValidAvgL100(v) ? v : nil
    }

    func priceHistory(days: Int) -> [FuelPricePoint] {
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -days, to: end) ?? end
        let descriptor = FetchDescriptor<FuelPricePoint>(
            predicate: #Predicate { point in
                point.date >= start && point.date <= end
            },
            sortBy: [SortDescriptor(\.date, order: .forward)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func addRefuel(_ entry: RefuelEntry) {
        modelContext.insert(entry)
        let price = FuelPricePoint(
            date: entry.date,
            pricePerLiter: entry.pricePerLiter,
            currencyCode: "TRY"
        )
        modelContext.insert(price)
        try? modelContext.save()
    }

    func calibrationSamples() -> [CalibrationSample] {
        let descriptor = FetchDescriptor<CalibrationSample>(
            sortBy: [SortDescriptor(\.date, order: .reverse)]
        )
        return (try? modelContext.fetch(descriptor)) ?? []
    }

    func save() {
        try? modelContext.save()
    }

    var context: ModelContext { modelContext }
}
