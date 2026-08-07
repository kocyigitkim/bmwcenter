import SwiftUI

struct MetricTile: View {
    enum Variant {
        case value
        case valueBar
        case valueTrend
        case empty
    }

    let label: String
    let systemImage: String
    let valueText: String?
    let unit: String
    var variant: Variant = .value
    var freshness: DataFreshness = .live
    var emptyReason: String? = nil
    var progress: Double? = nil
    var zones: [GaugeZone] = []
    var range: ClosedRange<Double> = 0...100
    var value: Double? = nil
    var trend: [Double] = []
    var accessibilitySummary: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: DSSpace.s2) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(Color.contentSecondary)
                    .layoutPriority(1)
                Text(label)
                    .font(DSFont.label())
                    .foregroundStyle(Color.contentSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
                    .layoutPriority(1)
                Spacer(minLength: 0)
                DataFreshnessDot(freshness: freshness)
                    .layoutPriority(1)
            }

            if variant == .empty {
                Text(emptyReason ?? String(localized: "data.notSupported", table: "Localizable"))
                    .font(DSFont.caption())
                    .foregroundStyle(Color.contentTertiary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(valueText ?? Formatters.unavailable)
                    .font(DSFont.metricXL())
                    .dsMetricDigit()
                    .foregroundStyle(Color.contentPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .frame(maxWidth: .infinity, alignment: .leading)

                Text(unit)
                    .font(DSFont.unit())
                    .foregroundStyle(Color.contentSecondary)
                    .lineLimit(1)

                if variant == .valueBar, let progress {
                    StatusBar(
                        progress: progress,
                        zones: zones,
                        value: value,
                        range: range
                    )
                    .padding(.top, 4)
                }

                if variant == .valueTrend {
                    MiniSparkline(values: trend)
                        .frame(height: 24)
                        .padding(.top, 4)
                }
            }
        }
        .padding(DSSpace.cardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .frame(minHeight: minHeight, alignment: .top)
        .opaqueSurface(radius: DSRadius.tile)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilitySummary ?? defaultA11y)
        .dsDynamicTypeClamp()
    }

    private var minHeight: CGFloat {
        switch variant {
        case .value: 112
        case .valueBar: 132
        case .valueTrend: 148
        case .empty: 84
        }
    }

    private var defaultA11y: String {
        if variant == .empty {
            return "\(label), \(emptyReason ?? String(localized: "data.notSupported", table: "Localizable"))"
        }
        return "\(label), \(valueText ?? Formatters.unavailable) \(unit)"
    }
}

struct MiniSparkline: View {
    let values: [Double]
    var tint: Color = .brandPrimary

    var body: some View {
        Canvas { context, size in
            guard values.count > 1,
                  let minV = values.min(),
                  let maxV = values.max()
            else { return }
            let span = max(maxV - minV, 0.001)
            var path = Path()
            for (i, v) in values.enumerated() {
                let x = size.width * CGFloat(i) / CGFloat(values.count - 1)
                let y = size.height * (1 - CGFloat((v - minV) / span))
                if i == 0 { path.move(to: CGPoint(x: x, y: y)) }
                else { path.addLine(to: CGPoint(x: x, y: y)) }
            }
            context.stroke(path, with: .color(tint), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
        .accessibilityHidden(true)
    }
}

#Preview("MetricTile variants") {
    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        MetricTile(label: "Coolant", systemImage: "thermometer.medium", valueText: "89", unit: "°C", variant: .valueBar, progress: 0.6, zones: GaugeZone.coolantZones(celsius: true), range: 0...160, value: 89)
        MetricTile(label: "Oil", systemImage: "oilcan.fill", valueText: nil, unit: "°C", variant: .empty, freshness: .unavailable, emptyReason: "Not supported by vehicle")
        MetricTile(label: "Instant", systemImage: "drop.fill", valueText: "17.5", unit: "L/100 km", variant: .valueTrend, trend: [12, 14, 18, 16, 17.5, 15])
        MetricTile(label: "Voltage", systemImage: "bolt.batteryblock.fill", valueText: "14.1", unit: "V", variant: .value)
    }
    .padding()
    .background(Color.canvas)
}
