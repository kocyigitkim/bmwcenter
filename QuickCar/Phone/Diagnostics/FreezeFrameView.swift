import SwiftUI

struct FreezeFrameView: View {
    @EnvironmentObject private var env: AppEnvironment
    let code: String
    @State private var snap = VehicleSnapshot()

    var body: some View {
        ScrollView {
            VStack(spacing: DSSpace.cardGap) {
                Text(code)
                    .font(DSFont.metricL())
                    .dsMetricDigit()
                    .foregroundStyle(Color.contentPrimary)
                MetricTile(
                    label: String(localized: "metric.speed", table: "Localizable"),
                    systemImage: "speedometer",
                    valueText: snap.speedKmh.map { MetricFormatter.speed($0) },
                    unit: String(localized: "unit.kmh", table: "Localizable"),
                    variant: .value
                )
                MetricTile(
                    label: String(localized: "metric.rpm", table: "Localizable"),
                    systemImage: "gauge.with.dots.needle.67percent",
                    valueText: snap.rpm.map { MetricFormatter.rpm($0) },
                    unit: String(localized: "unit.rpm", table: "Localizable"),
                    variant: .value
                )
                MetricTile(
                    label: String(localized: "metric.coolant", table: "Localizable"),
                    systemImage: "thermometer.medium",
                    valueText: snap.coolantC.map { MetricFormatter.temperature($0) },
                    unit: String(localized: "unit.celsius", table: "Localizable"),
                    variant: .value
                )
            }
            .padding(DSSpace.screenEdge)
        }
        .background(Color.canvas.ignoresSafeArea())
        .navigationTitle(String(localized: "freezeFrame.title", table: "Localizable"))
        .task {
            if let frame = try? await env.obd.readFreezeFrame() {
                snap = frame
            }
        }
    }
}
