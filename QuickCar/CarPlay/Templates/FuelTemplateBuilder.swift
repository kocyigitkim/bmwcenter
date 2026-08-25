import CarPlay
import UIKit

@MainActor
enum FuelTemplateBuilder {
    static func make(
        today: DrivingSummary,
        week: DrivingSummary,
        fuelLevel: Double?,
        rangeKm: Double?,
        lastRefuelText: String,
        settings: AppSettings,
        onSelectDetail: @escaping () -> Void
    ) -> CPListTemplate {
        let template = CPListTemplate(
            title: String(localized: "tab.fuel", table: "Localizable"),
            sections: sections(
                today: today,
                week: week,
                fuelLevel: fuelLevel,
                rangeKm: rangeKm,
                lastRefuelText: lastRefuelText,
                settings: settings,
                onSelectDetail: onSelectDetail
            )
        )
        template.tabTitle = String(localized: "tab.fuel", table: "Localizable")
        template.tabImage = UIImage(systemName: "fuelpump.fill")?
            .applyingSymbolConfiguration(.init(pointSize: 24, weight: .regular))
        return template
    }

    static func sections(
        today: DrivingSummary,
        week: DrivingSummary,
        fuelLevel: Double?,
        rangeKm: Double?,
        lastRefuelText: String,
        settings: AppSettings,
        onSelectDetail: @escaping () -> Void
    ) -> [CPListSection] {
        let todayItems = summaryItems(today, settings: settings, onSelect: onSelectDetail)
        let weekItems = summaryItems(week, settings: settings, onSelect: onSelectDetail)
        let tankItems: [CPListItem] = [
            {
                let item = CPListItem(
                    text: Formatters.truncate(String(localized: "fuel.level", table: "Localizable"), max: 30),
                    detailText: Formatters.truncate(
                        "\(Formatters.percent(fuelLevel)) · \(TextBar.make((fuelLevel ?? 0) / 100))",
                        max: 40
                    )
                )
                item.handler = { _, completion in onSelectDetail(); completion() }
                return item
            }(),
            CPListItem(
                text: Formatters.truncate(String(localized: "fuel.estimatedRange", table: "Localizable"), max: 30),
                detailText: Formatters.truncate(Formatters.distance(rangeKm, settings: settings), max: 40)
            ),
            CPListItem(
                text: Formatters.truncate(String(localized: "fuel.lastRefuel", table: "Localizable"), max: 30),
                detailText: Formatters.truncate(lastRefuelText, max: 40)
            )
        ]
        return [
            CPListSection(items: todayItems, header: String(localized: "fuel.today", table: "Localizable"), sectionIndexTitle: nil),
            CPListSection(items: weekItems, header: String(localized: "fuel.week", table: "Localizable"), sectionIndexTitle: nil),
            CPListSection(items: tankItems, header: String(localized: "carplay.tankHeader", table: "Localizable"), sectionIndexTitle: nil)
        ]
    }

    static func detailTemplate(daily: [(date: Date, liters: Double)], settings: AppSettings) -> CPInformationTemplate {
        let items = daily.suffix(7).prefix(10).map { day in
            CPInformationItem(
                title: day.date.formatted(date: .abbreviated, time: .omitted),
                detail: Formatters.liters(day.liters)
            )
        }
        return CPInformationTemplate(
            title: String(localized: "tab.fuel", table: "Localizable"),
            layout: .twoColumn,
            items: Array(items),
            actions: []
        )
    }

    private static func summaryItems(_ s: DrivingSummary, settings: AppSettings, onSelect: @escaping () -> Void) -> [CPListItem] {
        let rows = [
            (String(localized: "trip.fuelUsed", table: "Localizable"), Formatters.liters(s.fuelUsedL)),
            (String(localized: "trip.distance", table: "Localizable"), Formatters.distance(s.distanceKm, settings: settings)),
            (String(localized: "trip.average", table: "Localizable"), Formatters.consumption(l100km: s.avgL100 == 0 ? nil : s.avgL100, settings: settings)),
            (String(localized: "fuel.cost", table: "Localizable"), Formatters.currency(s.estimatedCost, code: settings.currencyCode))
        ]
        return rows.map { text, detail in
            let item = CPListItem(
                text: Formatters.truncate(text, max: 30),
                detailText: Formatters.truncate(detail, max: 40)
            )
            item.handler = { _, completion in onSelect(); completion() }
            return item
        }
    }
}
