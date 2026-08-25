import CarPlay
import UIKit

@MainActor
enum LiveTemplateBuilder {
    static func make(
        snapshot: VehicleSnapshot,
        connection: OBDConnectionState,
        instantText: String,
        rangeKm: Double?,
        isRecording: Bool,
        settings: AppSettings,
        onStartStop: @escaping () -> Void,
        onRefresh: @escaping () -> Void,
        onReconnect: @escaping () -> Void
    ) -> CPListTemplate {
        let template = CPListTemplate(
            title: String(localized: "tab.live", table: "Localizable"),
            sections: sections(
                snapshot: snapshot,
                connection: connection,
                instantText: instantText,
                rangeKm: rangeKm,
                isRecording: isRecording,
                settings: settings,
                onStartStop: onStartStop,
                onRefresh: onRefresh,
                onReconnect: onReconnect
            )
        )
        template.tabTitle = String(localized: "tab.live", table: "Localizable")
        template.tabImage = UIImage(systemName: "gauge.with.dots.needle.67percent")?
            .applyingSymbolConfiguration(.init(pointSize: 24, weight: .regular))
        return template
    }

    static func sections(
        snapshot: VehicleSnapshot,
        connection: OBDConnectionState,
        instantText: String,
        rangeKm: Double?,
        isRecording: Bool,
        settings: AppSettings,
        onStartStop: @escaping () -> Void,
        onRefresh: @escaping () -> Void,
        onReconnect: @escaping () -> Void
    ) -> [CPListSection] {
        let connected: Bool = {
            if case .connected = connection { return true }
            return false
        }()

        var liveItems: [CPListItem] = []
        var moreItems: [CPListItem] = []

        if !connected {
            let warn = CPListItem(
                text: Formatters.truncate(String(localized: "connection.disconnected", table: "Localizable"), max: 16),
                detailText: Formatters.truncate(String(localized: "connection.tapToConnect", table: "Localizable"), max: 40),
                image: UIImage(systemName: "exclamationmark.triangle.fill")?
                    .withTintColor(SemanticColor.critical.uiColor, renderingMode: .alwaysOriginal)
            )
            liveItems.append(warn)
        }

        let speedProgress = (snapshot.speedKmh ?? 0) / 220
        let rpmProgress = (snapshot.rpm ?? 0) / 7000
        let coolProgress = min(max(((snapshot.coolantC ?? 60) - 60) / 60, 0), 1)
        let fuelProgress = (snapshot.fuelLevelPct ?? 0) / 100
        let loadProgress = (snapshot.engineLoadPct ?? 0) / 100

        let primary: [CPListItem] = [
            item(
                text: String(localized: "metric.speed", table: "Localizable"),
                detail: connected ? Formatters.speed(snapshot.speedKmh, settings: settings) : Formatters.unavailable,
                image: GaugeIconRenderer.icon(progress: speedProgress, semantic: .from(progress: speedProgress))
            ),
            item(
                text: String(localized: "metric.rpm", table: "Localizable"),
                detail: connected ? Formatters.rpm(snapshot.rpm) : Formatters.unavailable,
                image: GaugeIconRenderer.icon(progress: rpmProgress, semantic: .from(progress: rpmProgress))
            ),
            item(
                text: String(localized: "metric.coolant", table: "Localizable"),
                detail: connected
                    ? detail(Formatters.temperature(snapshot.coolantC, settings: settings), bar: coolProgress)
                    : Formatters.unavailable,
                image: GaugeIconRenderer.icon(progress: coolProgress, semantic: .from(progress: coolProgress))
            ),
            item(
                text: String(localized: "metric.fuelLevel", table: "Localizable"),
                detail: connected
                    ? detail(
                        Formatters.percent(snapshot.fuelLevelPct),
                        bar: fuelProgress,
                        secondary: Formatters.distance(rangeKm, settings: settings)
                    )
                    : Formatters.unavailable,
                image: GaugeIconRenderer.icon(
                    progress: fuelProgress,
                    semantic: fuelProgress < 0.08 ? .critical : (fuelProgress < 0.15 ? .attention : .nominal)
                )
            ),
            item(
                text: String(localized: "metric.consumption", table: "Localizable"),
                detail: connected ? Formatters.truncate(instantText, max: 40) : Formatters.unavailable,
                image: UIImage(systemName: "drop.fill")
            )
        ]

        // Live ≤ 6 rows (including optional disconnect warning)
        let liveBudget = 6 - liveItems.count
        liveItems.append(contentsOf: primary.prefix(liveBudget))
        if primary.count > liveBudget {
            moreItems.append(contentsOf: primary.dropFirst(liveBudget))
        }

        moreItems.append(contentsOf: [
            item(
                text: String(localized: "metric.boost", table: "Localizable"),
                detail: connected ? Formatters.boost(snapshot.boostBar, settings: settings) : Formatters.unavailable,
                image: UIImage(systemName: "wind")
            ),
            item(
                text: String(localized: "metric.engineLoad", table: "Localizable"),
                detail: connected
                    ? detail(Formatters.percent(snapshot.engineLoadPct), bar: loadProgress)
                    : Formatters.unavailable,
                image: UIImage(systemName: "engine.combustion.fill")
            ),
            item(
                text: String(localized: "metric.voltage", table: "Localizable"),
                detail: connected ? Formatters.voltage(snapshot.voltage) : Formatters.unavailable,
                image: UIImage(systemName: "bolt.batteryblock.fill")
            )
        ])

        var sections: [CPListSection] = [
            CPListSection(
                items: liveItems,
                header: String(localized: "carplay.liveHeader", table: "Localizable"),
                sectionIndexTitle: nil
            )
        ]
        if !moreItems.isEmpty {
            sections.append(
                CPListSection(
                    items: moreItems,
                    header: String(localized: "carplay.moreHeader", table: "Localizable"),
                    sectionIndexTitle: nil
                )
            )
        }

        var actions: [CPListItem] = []
        let tripItem = CPListItem(
            text: Formatters.truncate(
                String(localized: String.LocalizationValue(isRecording ? "trip.stop" : "trip.start"), table: "Localizable"),
                max: 30
            ),
            detailText: nil,
            image: UIImage(systemName: isRecording ? "stop.circle.fill" : "play.circle.fill")
        )
        tripItem.handler = { _, completion in
            onStartStop()
            completion()
        }
        actions.append(tripItem)

        let refresh = CPListItem(
            text: Formatters.truncate(String(localized: "action.refresh", table: "Localizable"), max: 30),
            detailText: nil,
            image: UIImage(systemName: "arrow.clockwise")
        )
        refresh.handler = { _, completion in
            onRefresh()
            completion()
        }
        actions.append(refresh)

        if !connected {
            let reconnect = CPListItem(
                text: Formatters.truncate(String(localized: "connection.reconnect", table: "Localizable"), max: 30),
                detailText: nil,
                image: UIImage(systemName: "antenna.radiowaves.left.and.right")
            )
            reconnect.handler = { _, completion in
                onReconnect()
                completion()
            }
            actions.append(reconnect)
        }

        sections.append(
            CPListSection(
                items: actions,
                header: String(localized: "carplay.actionsHeader", table: "Localizable"),
                sectionIndexTitle: nil
            )
        )
        return sections
    }

    /// detail contract: `<value> · <bar> <%> · <secondary>`
    private static func detail(_ value: String, bar: Double? = nil, secondary: String? = nil) -> String {
        var parts = [value]
        if let bar {
            let pct = Int((min(max(bar, 0), 1) * 100).rounded())
            parts.append("\(TextBar.make(bar)) \(pct)%")
        }
        if let secondary {
            parts.append(secondary)
        }
        return Formatters.truncate(parts.joined(separator: " · "), max: 40)
    }

    private static func item(text: String, detail: String, image: UIImage?) -> CPListItem {
        CPListItem(
            text: Formatters.truncate(text, max: 16),
            detailText: Formatters.truncate(detail, max: 40),
            image: image
        )
    }
}
