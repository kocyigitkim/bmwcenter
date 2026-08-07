import SwiftUI
import SwiftData

struct TripListView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings
    @Query(sort: \Trip.startedAt, order: .reverse) private var trips: [Trip]
    @State private var filter: TripFilter = .all

    private enum TripFilter: String, CaseIterable, Identifiable {
        case all, personal, business
        var id: String { rawValue }
        var titleKey: String {
            switch self {
            case .all: "trips.filter.all"
            case .personal: "trips.filter.personal"
            case .business: "trips.filter.business"
            }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if filtered.isEmpty {
                    EmptyState(
                        title: String(localized: "trips.empty.title", table: "Localizable"),
                        message: String(localized: "trips.empty.subtitle", table: "Localizable"),
                        systemImage: "road.lanes"
                    )
                } else {
                    List {
                        Section {
                            Picker("", selection: $filter) {
                                ForEach(TripFilter.allCases) { f in
                                    Text(String(localized: String.LocalizationValue(f.titleKey), table: "Localizable")).tag(f)
                                }
                            }
                            .pickerStyle(.segmented)
                            .listRowBackground(Color.clear)
                            .listRowInsets(EdgeInsets(top: 8, leading: DSSpace.screenEdge, bottom: 8, trailing: DSSpace.screenEdge))
                        }

                        ForEach(grouped, id: \.title) { section in
                            Section {
                                ForEach(section.trips, id: \.id) { trip in
                                    NavigationLink {
                                        TripDetailView(trip: trip)
                                    } label: {
                                        tripRow(trip)
                                    }
                                    .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                        Button(role: .destructive) {
                                            env.tripRepository.context.delete(trip)
                                            env.tripRepository.save()
                                        } label: {
                                            Label(String(localized: "trip.delete", table: "Localizable"), systemImage: "trash")
                                        }
                                    }
                                    .swipeActions(edge: .leading) {
                                        Button {
                                            toggleCategory(trip)
                                        } label: {
                                            Label(String(localized: "trips.filter.personal", table: "Localizable"), systemImage: "arrow.left.arrow.right")
                                        }
                                        .tint(Color.brandPrimary)
                                    }
                                }
                            } header: {
                                Text(section.title)
                                    .font(DSFont.label())
                                    .foregroundStyle(Color.contentSecondary)
                                    .textCase(.uppercase)
                                    .tracking(0.6)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(Color.canvas.ignoresSafeArea())
            .navigationTitle(String(localized: "tab.trips", table: "Localizable"))
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var filtered: [Trip] {
        switch filter {
        case .all: trips
        case .personal: trips.filter { $0.category == .personal }
        case .business: trips.filter { $0.category == .business }
        }
    }

    private var grouped: [(title: String, trips: [Trip])] {
        let calendar = Calendar.current
        let dict = Dictionary(grouping: filtered) { calendar.startOfDay(for: $0.startedAt) }
        return dict.keys.sorted(by: >).map { day in
            let title: String
            if calendar.isDateInToday(day) {
                title = String(localized: "trips.today", table: "Localizable")
            } else if calendar.isDateInYesterday(day) {
                title = String(localized: "trips.yesterday", table: "Localizable")
            } else {
                title = day.formatted(date: .abbreviated, time: .omitted)
            }
            return (title, dict[day]!.sorted { $0.startedAt > $1.startedAt })
        }
    }

    private func tripRow(_ trip: Trip) -> some View {
        HStack(spacing: DSSpace.s3) {
            ZStack {
                Circle()
                    .stroke(Color.hairline, lineWidth: 3)
                Circle()
                    .trim(from: 0, to: CGFloat(min(max((trip.scoreTotal ?? 0) / 100, 0), 1)))
                    .stroke(Color.brandPrimary, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text(trip.scoreTotal.map { "\(Int($0.rounded()))" } ?? "—")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .dsMetricDigit()
                    .foregroundStyle(Color.contentPrimary)
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 4) {
                Text(timeRange(trip))
                    .font(DSFont.label())
                    .foregroundStyle(Color.contentPrimary)
                Text("\(Formatters.distance(trip.distanceKm, settings: settings)) · \(Formatters.duration(trip.durationS))")
                    .font(DSFont.caption())
                    .foregroundStyle(Color.contentSecondary)
            }
            Spacer()
            Text(Formatters.consumption(l100km: trip.avgL100 == 0 ? nil : trip.avgL100, settings: settings))
                .font(DSFont.caption())
                .dsMetricDigit()
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(badgeColor(for: trip.avgL100).opacity(0.18), in: Capsule())
                .foregroundStyle(badgeColor(for: trip.avgL100))
        }
        .padding(.vertical, 4)
    }

    private func timeRange(_ trip: Trip) -> String {
        let start = trip.startedAt.formatted(date: .omitted, time: .shortened)
        if let end = trip.endedAt {
            return "\(start) – \(end.formatted(date: .omitted, time: .shortened))"
        }
        return start
    }

    private func badgeColor(for avg: Double) -> Color {
        guard FuelCalculator.isValidAvgL100(avg) else { return .contentTertiary }
        if avg < 7 { return .semNominal }
        if avg < 10 { return .semAttention }
        return .semCritical
    }

    private func toggleCategory(_ trip: Trip) {
        trip.category = trip.category == .personal ? .business : .personal
        env.tripRepository.save()
    }
}
