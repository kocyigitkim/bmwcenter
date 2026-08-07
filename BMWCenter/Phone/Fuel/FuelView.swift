import SwiftUI
import SwiftData
import Charts

struct FuelView: View {
    @EnvironmentObject private var env: AppEnvironment
    @EnvironmentObject private var obd: OBDService
    @Environment(AppSettings.self) private var settings
    @Query(sort: \RefuelEntry.date, order: .reverse) private var refuels: [RefuelEntry]
    @State private var period: FuelPeriod = .today
    @State private var showAdd = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: DSSpace.cardGap) {
                    Picker("", selection: $period) {
                        ForEach(FuelPeriod.allCases) { p in
                            Text(String(localized: String.LocalizationValue(p.titleKey), table: "Localizable")).tag(p)
                        }
                    }
                    .pickerStyle(.segmented)
                    .padding(.horizontal, DSSpace.screenEdge)

                    let summary = currentSummary
                    VStack(alignment: .leading, spacing: DSSpace.s3) {
                        Text(MetricFormatter.number(summary.fuelUsedL, fractionLength: 2))
                            .font(DSFont.display())
                            .dsMetricDigit()
                            .foregroundStyle(Color.contentPrimary)
                        Text(String(localized: "unit.liter", table: "Localizable"))
                            .font(DSFont.unit())
                            .foregroundStyle(Color.contentSecondary)

                        HStack(spacing: DSSpace.s4) {
                            microMetric(
                                Formatters.distance(summary.distanceKm, settings: settings),
                                String(localized: "trip.distance", table: "Localizable")
                            )
                            microMetric(
                                Formatters.consumption(l100km: summary.avgL100 == 0 ? nil : summary.avgL100, settings: settings),
                                String(localized: "trip.average", table: "Localizable")
                            )
                            microMetric(
                                Formatters.currency(summary.estimatedCost, code: settings.currencyCode),
                                String(localized: "fuel.cost", table: "Localizable")
                            )
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(DSSpace.cardPadding)
                    .glassSurface(.card)
                    .padding(.horizontal, DSSpace.screenEdge)

                    Chart(dailyFuel, id: \.date) { item in
                        AreaMark(
                            x: .value("day", item.date, unit: .day),
                            y: .value("L", item.liters)
                        )
                        .foregroundStyle(
                            LinearGradient(
                                colors: [Color.brandPrimary.opacity(0.25), Color.brandPrimary.opacity(0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        LineMark(
                            x: .value("day", item.date, unit: .day),
                            y: .value("L", item.liters)
                        )
                        .foregroundStyle(Color.brandPrimary)
                    }
                    .frame(height: 160)
                    .padding(DSSpace.cardPadding)
                    .opaqueSurface()
                    .padding(.horizontal, DSSpace.screenEdge)

                    HStack(spacing: DSSpace.s4) {
                        VerticalFuelCapsule(level: (obd.snapshot.fuelLevelPct ?? 0) / 100)
                            .frame(width: 36, height: 120)
                        VStack(alignment: .leading, spacing: DSSpace.s2) {
                            Text(String(localized: "fuel.estimatedRange", table: "Localizable"))
                                .font(DSFont.label())
                                .foregroundStyle(Color.contentSecondary)
                            Text(Formatters.distance(rangeKm, settings: settings))
                                .font(DSFont.metricXL())
                                .dsMetricDigit()
                                .foregroundStyle(Color.contentPrimary)
                            Text(Formatters.percent(obd.snapshot.fuelLevelPct))
                                .font(DSFont.unit())
                                .foregroundStyle(Color.contentSecondary)
                        }
                        Spacer()
                    }
                    .padding(DSSpace.cardPadding)
                    .opaqueSurface()
                    .padding(.horizontal, DSSpace.screenEdge)

                    CalibrationCard()
                        .padding(.horizontal, DSSpace.screenEdge)

                    VStack(alignment: .leading, spacing: DSSpace.s2) {
                        HStack {
                            Text(String(localized: "fuel.lastRefuel", table: "Localizable"))
                                .font(DSFont.title())
                                .foregroundStyle(Color.contentPrimary)
                            Spacer()
                            Button(String(localized: "fuel.addRefuel", table: "Localizable")) {
                                showAdd = true
                            }
                            .font(DSFont.label())
                            .foregroundStyle(Color.brandPrimary)
                        }
                        if refuels.isEmpty {
                            Text(String(localized: "fuel.empty.title", table: "Localizable"))
                                .font(DSFont.caption())
                                .foregroundStyle(Color.contentTertiary)
                        } else {
                            ForEach(refuels.prefix(10), id: \.id) { entry in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(entry.date.formatted(date: .abbreviated, time: .omitted))
                                            .font(DSFont.label())
                                            .foregroundStyle(Color.contentPrimary)
                                        if let station = entry.stationName {
                                            Text(station)
                                                .font(DSFont.caption())
                                                .foregroundStyle(Color.contentSecondary)
                                        }
                                    }
                                    Spacer()
                                    Text(Formatters.liters(entry.liters))
                                        .font(DSFont.label())
                                        .dsMetricDigit()
                                        .foregroundStyle(Color.contentPrimary)
                                    if entry.isFullTank {
                                        Text(String(localized: "fuel.fullTank", table: "Localizable"))
                                            .font(DSFont.caption())
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.semInfo.opacity(0.2), in: Capsule())
                                            .foregroundStyle(Color.semInfo)
                                    }
                                }
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    .padding(DSSpace.cardPadding)
                    .opaqueSurface()
                    .padding(.horizontal, DSSpace.screenEdge)
                    .padding(.bottom, DSSpace.s6)
                }
            }
            .background(Color.canvas.ignoresSafeArea())
            .navigationTitle(String(localized: "tab.fuel", table: "Localizable"))
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showAdd) {
                AddRefuelSheet { entry in
                    env.tripRepository.context.insert(entry)
                    env.tripRepository.save()
                }
            }
        }
    }

    private func microMetric(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(DSFont.label())
                .dsMetricDigit()
                .foregroundStyle(Color.contentPrimary)
            Text(label)
                .font(DSFont.caption())
                .foregroundStyle(Color.contentTertiary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var currentSummary: DrivingSummary {
        let now = Date()
        let calendar = Calendar.current
        switch period {
        case .today:
            let start = calendar.startOfDay(for: now)
            return env.tripRepository.summary(for: DateInterval(start: start, end: start.addingTimeInterval(86400)))
        case .week:
            let start = calendar.date(byAdding: .day, value: -7, to: now) ?? now
            return env.tripRepository.summary(for: DateInterval(start: start, end: now))
        case .month:
            let start = calendar.date(byAdding: .month, value: -1, to: now) ?? now
            return env.tripRepository.summary(for: DateInterval(start: start, end: now))
        case .all:
            return env.tripRepository.summary(for: DateInterval(start: Date.distantPast, end: now))
        }
    }

    private var dailyFuel: [(date: Date, liters: Double)] {
        env.fuelStatistics.dailyFuel()
    }

    private var rangeKm: Double? {
        FuelCalculator.estimatedRangeKm(
            fuelLevelPct: obd.snapshot.fuelLevelPct,
            tankCapacityL: settings.tankCapacityL,
            avgL100: currentSummary.avgL100 == 0 ? nil : currentSummary.avgL100
        )
    }
}

private struct VerticalFuelCapsule: View {
    let level: Double

    var body: some View {
        GeometryReader { geo in
            let h = geo.size.height * min(max(level, 0), 1)
            ZStack(alignment: .bottom) {
                Capsule().fill(Color.surface2)
                Capsule()
                    .fill(Color.semNominal)
                    .frame(height: max(h, 0))
                    .animation(MotionTokens.barFill, value: level)
            }
        }
    }
}
