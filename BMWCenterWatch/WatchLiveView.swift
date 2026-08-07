import SwiftUI

struct WatchLiveView: View {
    @ObservedObject var bridge: WatchConnectivityBridge

    var body: some View {
        VStack(spacing: 8) {
            metric(String(localized: "metric.speed"), value: format(bridge.speedKmh), unit: "km/h")
            metric(String(localized: "metric.rpm"), value: format(bridge.rpm), unit: "")
            metric(String(localized: "metric.fuelLevel"), value: format(bridge.fuelLevelPct), unit: "%")
            metric(String(localized: "metric.instant"), value: format(bridge.instantL100), unit: "L/100")
        }
        .padding(8)
        .navigationTitle("BMW")
    }

    private func metric(_ title: String, value: String, unit: String) -> some View {
        HStack {
            Text(title)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
            if !unit.isEmpty {
                Text(unit).font(.caption2).foregroundStyle(.secondary)
            }
        }
    }

    private func format(_ value: Double?) -> String {
        guard let value else { return "—" }
        return String(format: "%.0f", value)
    }
}
