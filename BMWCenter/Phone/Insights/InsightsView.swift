import SwiftUI

struct InsightsView: View {
    @EnvironmentObject private var env: AppEnvironment

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DSSpace.cardGap) {
                    let summary = env.tripRepository.summary(
                        for: DateInterval(
                            start: Calendar.current.date(byAdding: .day, value: -30, to: Date()) ?? Date(),
                            end: Date()
                        )
                    )

                    ScoreRing(score: summary.avgScore)
                        .padding(DSSpace.cardPadding)
                        .opaqueSurface()
                        .padding(.horizontal, DSSpace.screenEdge)

                    VStack(spacing: DSSpace.s2) {
                        eventCounter("flame.fill", "\(summary.tripCount)", String(localized: "tab.trips", table: "Localizable"))
                        HStack(spacing: DSSpace.cardGap) {
                            eventBox("road.lanes", Formatters.distance(summary.distanceKm, settings: env.settings))
                            eventBox("drop.fill", Formatters.liters(summary.fuelUsedL))
                            eventBox("parkingsign", Formatters.liters(summary.idleFuelL))
                        }
                    }
                    .padding(.horizontal, DSSpace.screenEdge)

                    VStack(alignment: .leading, spacing: DSSpace.s2) {
                        Text(String(localized: "fuel.cost", table: "Localizable"))
                            .font(DSFont.title())
                            .foregroundStyle(Color.contentPrimary)
                        StatRow(
                            title: String(localized: "metric.fuelUsed", table: "Localizable"),
                            value: Formatters.liters(summary.fuelUsedL)
                        )
                        StatRow(
                            title: String(localized: "metric.distance", table: "Localizable"),
                            value: Formatters.distance(summary.distanceKm, settings: env.settings)
                        )
                        if summary.distanceKm > 0 {
                            StatRow(
                                title: String(localized: "fuel.cost", table: "Localizable"),
                                value: Formatters.currency(
                                    summary.estimatedCost / max(summary.distanceKm, 0.1),
                                    code: env.settings.currencyCode
                                ) + "/km"
                            )
                        }
                    }
                    .padding(DSSpace.cardPadding)
                    .opaqueSurface()
                    .padding(.horizontal, DSSpace.screenEdge)

                    VStack(spacing: DSSpace.s2) {
                        navRow(
                            title: String(localized: "battery.title", table: "Localizable"),
                            systemImage: "minus.plus.batteryblock",
                            destination: BatteryHealthView()
                        )
                        navRow(
                            title: String(localized: "accel.title", table: "Localizable"),
                            systemImage: "stopwatch.fill",
                            destination: AccelTestView()
                        )
                        navRow(
                            title: String(localized: "maintenance.title", table: "Localizable"),
                            systemImage: "wrench.and.screwdriver.fill",
                            destination: MaintenanceListView()
                        )
                        navRow(
                            title: String(localized: "report.monthly", table: "Localizable"),
                            systemImage: "doc.text.fill",
                            destination: MonthlyReportView()
                        )
                        navRow(
                            title: String(localized: "dtc.stored", table: "Localizable"),
                            systemImage: "exclamationmark.triangle.fill",
                            destination: DTCListView()
                        )
                        navRow(
                            title: String(localized: "dtc.catalog.title", table: "Localizable"),
                            systemImage: "list.bullet.rectangle",
                            destination: DTCCatalogView()
                        )
                    }
                    .padding(.horizontal, DSSpace.screenEdge)
                    .padding(.bottom, DSSpace.s6)
                }
                .padding(.top, DSSpace.s3)
            }
            .background(Color.canvas.ignoresSafeArea())
            .navigationTitle(String(localized: "insights.title", table: "Localizable"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func eventCounter(_ symbol: String, _ value: String, _ label: String) -> some View {
        HStack {
            Image(systemName: symbol).foregroundStyle(Color.brandPrimary)
            Text(label).foregroundStyle(Color.contentSecondary)
            Spacer()
            Text(value)
                .font(DSFont.metricL())
                .dsMetricDigit()
                .foregroundStyle(Color.contentPrimary)
        }
        .padding(DSSpace.cardPadding)
        .glassSurface(.card)
    }

    private func eventBox(_ symbol: String, _ value: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: symbol)
                .foregroundStyle(Color.contentSecondary)
            Text(value)
                .font(DSFont.caption())
                .dsMetricDigit()
                .foregroundStyle(Color.contentPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, DSSpace.s3)
        .opaqueSurface(radius: DSRadius.tile)
    }

    private func navRow<D: View>(title: String, systemImage: String, destination: D) -> some View {
        NavigationLink {
            destination
        } label: {
            HStack {
                Image(systemName: systemImage)
                    .foregroundStyle(Color.brandPrimary)
                Text(title)
                    .foregroundStyle(Color.contentPrimary)
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(Color.contentTertiary)
            }
            .padding(DSSpace.cardPadding)
            .glassSurface(.card)
        }
        .buttonStyle(.plain)
    }
}
