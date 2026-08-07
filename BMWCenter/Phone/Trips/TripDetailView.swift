import SwiftUI
import Charts

struct TripDetailView: View {
    @EnvironmentObject private var env: AppEnvironment
    @Environment(AppSettings.self) private var settings
    @Environment(\.dismiss) private var dismiss
    let trip: Trip
    @State private var shareURL: URL?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                VStack(spacing: 8) {
                    StatRow(title: String(localized: "trip.distance", table: "Localizable"),
                            value: Formatters.distance(trip.distanceKm, settings: settings))
                    StatRow(title: String(localized: "trip.duration", table: "Localizable"),
                            value: Formatters.duration(trip.durationS))
                    StatRow(title: String(localized: "trip.fuelUsed", table: "Localizable"),
                            value: Formatters.liters(trip.fuelUsedL))
                    StatRow(title: String(localized: "trip.average", table: "Localizable"),
                            value: Formatters.consumption(l100km: trip.avgL100 == 0 ? nil : trip.avgL100, settings: settings))
                    StatRow(title: String(localized: "trip.avgSpeed", table: "Localizable"),
                            value: Formatters.speed(trip.avgSpeedKmh, settings: settings))
                    StatRow(title: String(localized: "trip.maxSpeed", table: "Localizable"),
                            value: Formatters.speed(trip.maxSpeedKmh, settings: settings))
                    StatRow(title: String(localized: "trip.idleTime", table: "Localizable"),
                            value: Formatters.duration(trip.idleDurationS))
                    if let start = trip.startPlaceName {
                        StatRow(title: String(localized: "trip.startedAt", table: "Localizable"), value: start)
                    }
                    if let end = trip.endPlaceName {
                        StatRow(title: String(localized: "trip.endedAt", table: "Localizable"), value: end)
                    }
                }
                .padding(DSSpace.cardPadding)
                .opaqueSurface()

                TripMapView(trip: trip)
                    .frame(height: 240)
                    .clipShape(RoundedRectangle(cornerRadius: DSRadius.card, style: .continuous))

                if !(trip.samples ?? []).isEmpty {
                    Chart {
                        ForEach((trip.samples ?? []).sorted(by: { $0.t < $1.t }), id: \.t) { sample in
                            LineMark(
                                x: .value("t", sample.t),
                                y: .value("speed", sample.speedKmh)
                            )
                            .foregroundStyle(Color.brandPrimary)
                        }
                    }
                    .frame(height: 180)
                    .padding(DSSpace.cardPadding)
                    .opaqueSurface()
                }
            }
            .padding(DSSpace.screenEdge)
        }
        .background(Color.canvas.ignoresSafeArea())
        .navigationTitle(trip.startedAt.formatted(date: .abbreviated, time: .shortened))
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(String(localized: "trip.export", table: "Localizable")) {
                        let range = DateInterval(start: trip.startedAt.addingTimeInterval(-1), end: (trip.endedAt ?? Date()).addingTimeInterval(1))
                        shareURL = env.tripRepository.exportCSV(range: range)
                    }
                    Button(String(localized: "trip.delete", table: "Localizable"), role: .destructive) {
                        env.tripRepository.deleteTrip(trip.id)
                        dismiss()
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(item: Binding(
            get: { shareURL.map { IdentifiedURL(url: $0) } },
            set: { shareURL = $0?.url }
        )) { item in
            ShareSheet(items: [item.url])
        }
    }
}

private struct IdentifiedURL: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
