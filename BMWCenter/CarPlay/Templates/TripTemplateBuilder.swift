import CarPlay
import UIKit

@MainActor
enum TripTemplateBuilder {
    static func make(
        live: LiveTripMetrics,
        isActive: Bool,
        settings: AppSettings,
        onStartStop: @escaping () -> Void
    ) -> CPListTemplate {
        let template = CPListTemplate(
            title: String(localized: "tab.trips", table: "Localizable"),
            sections: sections(live: live, isActive: isActive, settings: settings, onStartStop: onStartStop)
        )
        template.tabTitle = String(localized: "tab.trips", table: "Localizable")
        template.tabImage = UIImage(systemName: "road.lanes")?
            .applyingSymbolConfiguration(.init(pointSize: 24, weight: .regular))
        if !isActive {
            template.emptyViewTitleVariants = [String(localized: "trip.none", table: "Localizable")]
            template.emptyViewSubtitleVariants = [String(localized: "trip.autoHint", table: "Localizable")]
        }
        return template
    }

    static func sections(
        live: LiveTripMetrics,
        isActive: Bool,
        settings: AppSettings,
        onStartStop: @escaping () -> Void
    ) -> [CPListSection] {
        if isActive {
            let items: [CPListItem] = [
                row(String(localized: "trip.duration", table: "Localizable"), Formatters.liveDuration(live.durationS)),
                row(String(localized: "trip.distance", table: "Localizable"), Formatters.distance(live.distanceKm, settings: settings)),
                row(String(localized: "trip.fuelUsed", table: "Localizable"), Formatters.liters(live.fuelUsedL)),
                row(String(localized: "trip.average", table: "Localizable"), Formatters.consumption(l100km: live.avgL100, settings: settings)),
                row(String(localized: "trip.avgSpeed", table: "Localizable"), Formatters.speed(live.avgSpeedKmh, settings: settings)),
                row(String(localized: "trip.maxSpeed", table: "Localizable"), Formatters.speed(live.maxSpeedKmh, settings: settings))
            ]
            let current = CPListSection(
                items: items,
                header: String(localized: "trip.current", table: "Localizable"),
                sectionIndexTitle: nil
            )
            let stop = CPListItem(
                text: Formatters.truncate(String(localized: "trip.stop", table: "Localizable"), max: 30),
                detailText: nil,
                image: UIImage(systemName: "stop.circle.fill")
            )
            stop.handler = { _, completion in
                onStartStop()
                completion()
            }
            let control = CPListSection(
                items: [stop],
                header: String(localized: "carplay.controlHeader", table: "Localizable"),
                sectionIndexTitle: nil
            )
            return [current, control]
        } else {
            let start = CPListItem(
                text: Formatters.truncate(String(localized: "trip.start", table: "Localizable"), max: 30),
                detailText: Formatters.truncate(String(localized: "trip.autoHint", table: "Localizable"), max: 40),
                image: UIImage(systemName: "play.circle.fill")
            )
            start.handler = { _, completion in
                onStartStop()
                completion()
            }
            return [CPListSection(items: [start])]
        }
    }

    private static func row(_ text: String, _ detail: String) -> CPListItem {
        CPListItem(
            text: Formatters.truncate(text, max: 30),
            detailText: Formatters.truncate(detail, max: 40)
        )
    }
}
