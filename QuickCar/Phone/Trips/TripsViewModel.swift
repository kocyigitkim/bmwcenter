import Foundation
import SwiftData

@MainActor
final class TripsViewModel: ObservableObject {
    private let repository: TripRepository

    init(repository: TripRepository) {
        self.repository = repository
    }

    func groupedTrips() -> [(title: String, trips: [Trip])] {
        let trips = repository.recentTrips(limit: 200)
        let calendar = Calendar.current
        let grouped = Dictionary(grouping: trips) { trip -> Date in
            calendar.startOfDay(for: trip.startedAt)
        }
        return grouped.keys.sorted(by: >).map { day in
            (title: dayTitle(day), trips: grouped[day]!.sorted { $0.startedAt > $1.startedAt })
        }
    }

    private func dayTitle(_ day: Date) -> String {
        let calendar = Calendar.current
        if calendar.isDateInToday(day) {
            return String(localized: "trips.today", table: "Localizable")
        }
        if calendar.isDateInYesterday(day) {
            return String(localized: "trips.yesterday", table: "Localizable")
        }
        return day.formatted(date: .abbreviated, time: .omitted)
    }

    func delete(_ trip: Trip) {
        repository.deleteTrip(trip.id)
    }
}
