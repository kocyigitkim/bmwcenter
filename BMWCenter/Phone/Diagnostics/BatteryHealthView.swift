import SwiftUI
import SwiftData

struct BatteryHealthView: View {
    @Query(sort: \CrankRecord.date, order: .reverse) private var cranks: [CrankRecord]

    var body: some View {
        List {
            if let latest = cranks.first {
                Section {
                    StatRow(
                        title: String(localized: "battery.crankVoltage", table: "Localizable"),
                        value: Formatters.voltage(latest.minVoltage)
                    )
                    StatRow(
                        title: String(localized: "battery.title", table: "Localizable"),
                        value: statusText(for: latest.minVoltage)
                    )
                }
            } else {
                EmptyStateView(
                    titleKey: "battery.title",
                    subtitleKey: "trips.empty.subtitle",
                    systemImage: "minus.plus.batteryblock"
                )
            }
            ForEach(cranks.prefix(20), id: \.date) { crank in
                HStack {
                    Text(crank.date.formatted(date: .abbreviated, time: .shortened))
                    Spacer()
                    Text(Formatters.voltage(crank.minVoltage))
                        .font(.system(size: 15, weight: .semibold, design: .rounded).monospacedDigit())
                }
            }
        }
        .navigationTitle(String(localized: "battery.title", table: "Localizable"))
    }

    private func statusText(for minV: Double) -> String {
        let key: String
        switch minV {
        case 10.5...: key = "battery.good"
        case 9.6..<10.5: key = "battery.fair"
        default: key = "battery.weak"
        }
        return String(localized: String.LocalizationValue(key), table: "Localizable")
    }
}
