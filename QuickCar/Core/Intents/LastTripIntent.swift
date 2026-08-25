import AppIntents
import Foundation

struct LastTripIntent: AppIntent {
    static var title: LocalizedStringResource = "Last trip"
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = await MainActor.run { () -> String in
            let env = AppEnvironment.shared
            guard let trip = env.tripRepository.recentTrips(limit: 1).first else {
                return String(localized: "trips.empty.title", table: "Localizable")
            }
            let distance = Formatters.distance(trip.distanceKm, settings: env.settings)
            let duration = Formatters.duration(trip.durationS)
            let consumption = Formatters.consumption(
                l100km: trip.avgL100 == 0 ? nil : trip.avgL100,
                settings: env.settings
            )
            return "\(distance) · \(duration) · \(consumption)"
        }
        return .result(dialog: IntentDialog(stringLiteral: text))
    }
}
