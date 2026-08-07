import Foundation
import SwiftData

enum FuelPeriod: String, CaseIterable, Identifiable {
    case today, week, month, all
    var id: String { rawValue }
    var titleKey: String {
        switch self {
        case .today: "fuel.today"
        case .week: "fuel.week"
        case .month: "fuel.month"
        case .all: "fuel.all"
        }
    }
}

@MainActor
final class FuelViewModel: ObservableObject {
    @Published var period: FuelPeriod = .today

    private let repository: TripRepository
    private let fuelStatistics: FuelStatistics
    private let settings: AppSettings
    private let obd: OBDService

    init(repository: TripRepository, fuelStatistics: FuelStatistics, settings: AppSettings, obd: OBDService) {
        self.repository = repository
        self.fuelStatistics = fuelStatistics
        self.settings = settings
        self.obd = obd
    }

    var summary: DrivingSummary {
        let now = Date()
        let calendar = Calendar.current
        switch period {
        case .today:
            let start = calendar.startOfDay(for: now)
            return repository.summary(for: DateInterval(start: start, end: start.addingTimeInterval(86400)))
        case .week:
            let start = calendar.date(byAdding: .day, value: -7, to: now) ?? now
            return repository.summary(for: DateInterval(start: start, end: now))
        case .month:
            let start = calendar.date(byAdding: .month, value: -1, to: now) ?? now
            return repository.summary(for: DateInterval(start: start, end: now))
        case .all:
            return repository.summary(for: DateInterval(start: .distantPast, end: now))
        }
    }

    var daily: [(date: Date, liters: Double)] { fuelStatistics.dailyFuel() }
    var lastRefuel: RefuelEntry? { fuelStatistics.lastRefuel() }
    var rangeKm: Double? {
        FuelCalculator.estimatedRangeKm(
            fuelLevelPct: obd.snapshot.fuelLevelPct,
            tankCapacityL: settings.tankCapacityL,
            avgL100: summary.avgL100 == 0 ? nil : summary.avgL100
        )
    }

    func addRefuel(_ entry: RefuelEntry) {
        repository.context.insert(entry)
        repository.save()
    }
}
