import CarPlay
import UIKit

@MainActor
enum HistoryTemplateBuilder {
    static func make(
        trips: [Trip],
        settings: AppSettings,
        onSelect: @escaping (Trip) -> Void
    ) -> CPListTemplate {
        let maxCount = CPListTemplate.maximumItemCount
        let limited = Array(trips.prefix(min(30, maxCount)))
        let items: [CPListItem] = limited.map { trip in
            let text = Formatters.truncate(
                "\(trip.startedAt.formatted(date: .omitted, time: .shortened)) · \(Formatters.distance(trip.distanceKm, settings: settings))",
                max: 30
            )
            let detail = Formatters.truncate(
                "\(Formatters.duration(trip.durationS)) · \(Formatters.consumption(l100km: trip.avgL100 == 0 ? nil : trip.avgL100, settings: settings))",
                max: 40
            )
            let item = CPListItem(text: text, detailText: detail)
            item.handler = { _, completion in
                onSelect(trip)
                completion()
            }
            return item
        }
        let template = CPListTemplate(
            title: String(localized: "tab.history", table: "Localizable"),
            sections: [CPListSection(items: items)]
        )
        template.tabTitle = String(localized: "tab.history", table: "Localizable")
        template.tabImage = UIImage(systemName: "clock.arrow.circlepath")?
            .applyingSymbolConfiguration(.init(pointSize: 24, weight: .regular))
        if items.isEmpty {
            template.emptyViewTitleVariants = [String(localized: "trips.empty.title", table: "Localizable")]
            template.emptyViewSubtitleVariants = [String(localized: "trips.empty.subtitle", table: "Localizable")]
        }
        return template
    }

    static func detail(for trip: Trip, settings: AppSettings) -> CPInformationTemplate {
        let pairs: [(String, String)] = [
            (String(localized: "trip.startedAt", table: "Localizable"), trip.startedAt.formatted(date: .abbreviated, time: .shortened)),
            (String(localized: "trip.endedAt", table: "Localizable"), (trip.endedAt ?? Date()).formatted(date: .abbreviated, time: .shortened)),
            (String(localized: "trip.distance", table: "Localizable"), Formatters.distance(trip.distanceKm, settings: settings)),
            (String(localized: "trip.duration", table: "Localizable"), Formatters.duration(trip.durationS)),
            (String(localized: "trip.fuelUsed", table: "Localizable"), Formatters.liters(trip.fuelUsedL)),
            (String(localized: "trip.average", table: "Localizable"), Formatters.consumption(l100km: trip.avgL100 == 0 ? nil : trip.avgL100, settings: settings)),
            (String(localized: "trip.maxSpeed", table: "Localizable"), Formatters.speed(trip.maxSpeedKmh, settings: settings)),
            (String(localized: "trip.idleTime", table: "Localizable"), Formatters.duration(trip.idleDurationS))
        ]
        let items = pairs.prefix(10).map { CPInformationItem(title: $0.0, detail: $0.1) }
        return CPInformationTemplate(
            title: String(localized: "tab.history", table: "Localizable"),
            layout: .twoColumn,
            items: Array(items),
            actions: []
        )
    }
}
