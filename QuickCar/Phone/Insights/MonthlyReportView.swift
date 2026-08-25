import SwiftUI

struct MonthlyReportView: View {
    @EnvironmentObject private var env: AppEnvironment
    @State private var shareURL: URL?

    var body: some View {
        VStack(spacing: 16) {
            let summary = env.tripRepository.monthTrips()
            Text(String(localized: "report.monthly", table: "Localizable"))
                .font(.system(size: 22, weight: .bold))
            StatRow(
                title: String(localized: "metric.distance", table: "Localizable"),
                value: Formatters.distance(summary.reduce(0) { $0 + $1.distanceKm }, settings: env.settings)
            )
            Button(String(localized: "report.generate", table: "Localizable")) {
                shareURL = PDFReportBuilder.build(
                    trips: summary,
                    settings: env.settings,
                    vehicleName: env.settings.vehicleName
                )
            }
            .buttonStyle(.borderedProminent)
            Spacer()
        }
        .padding()
        .navigationTitle(String(localized: "report.monthly", table: "Localizable"))
        .sheet(item: Binding(
            get: { shareURL.map(IdentifiableURL.init) },
            set: { shareURL = $0?.url }
        )) { item in
            ShareSheet(url: item.url)
        }
    }
}

private struct IdentifiableURL: Identifiable {
    let id = UUID()
    let url: URL
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
