import SwiftUI

struct GaugeRing: View {
    enum Size {
        case hero
        case compact

        var diameter: CGFloat {
            switch self {
            case .hero: 188
            case .compact: 112
            }
        }

        var trackWidth: CGFloat {
            switch self {
            case .hero: 16
            case .compact: 10
            }
        }

        var valueFont: CGFloat {
            switch self {
            case .hero: 48
            case .compact: 28
            }
        }
    }

    let value: Double?
    let range: ClosedRange<Double>
    let zones: [GaugeZone]
    let unit: String
    let caption: String
    var size: Size = .hero
    /// When set, overrides `size.diameter` (used to fit 2-up hero gauges).
    var diameter: CGFloat? = nil
    var precision: Int = 0
    var freshness: DataFreshness = .live
    var emptyReason: String? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    private let sweepDegrees: Double = 240
    private let startDegrees: Double = 150

    private var resolvedDiameter: CGFloat { diameter ?? size.diameter }

    private var scale: CGFloat {
        let base = size.diameter
        guard base > 0 else { return 1 }
        return resolvedDiameter / base
    }

    private var resolvedTrackWidth: CGFloat { size.trackWidth * scale }

    private var normalized: Double {
        guard let value else { return 0 }
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return min(max((value - range.lowerBound) / span, 0), 1)
    }

    private var activeSemantic: SemanticColor {
        guard let value else { return .inactive }
        return GaugeZone.semantic(for: value, in: zones)
    }

    private var isUnavailable: Bool {
        value == nil || freshness == .unavailable || freshness == .disconnected || freshness == .error
    }

    private var isStale: Bool {
        freshness == .stale || (value != nil && freshness == .live && false)
    }

    var body: some View {
        ZStack {
            Canvas { context, canvasSize in
                drawGauge(context: context, size: canvasSize)
            }

            VStack(spacing: 2) {
                Text(displayValue)
                    .font(DSFont.display(size.valueFont * scale))
                    .dsMetricDigit()
                    .foregroundStyle(valueColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(unit)
                    .font(DSFont.unit(13 * max(scale, 0.85)))
                    .foregroundStyle(Color.contentSecondary)
                Text(bottomCaption)
                    .font(DSFont.label(13 * max(scale, 0.85)))
                    .foregroundStyle(Color.contentSecondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .padding(.top, resolvedTrackWidth)

            if freshness == .stale {
                Image(systemName: "clock.badge.exclamationmark")
                    .font(.system(size: 12 * scale, weight: .semibold))
                    .foregroundStyle(Color.semAttention)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
                    .padding(8 * scale)
            }
        }
        .frame(width: resolvedDiameter, height: resolvedDiameter)
        .opacity(ringOpacity)
        .animation(MotionTokens.gaugeValue(reduceMotion: reduceMotion), value: value)
        .onAppear { updatePulse() }
        .onChange(of: activeSemantic) { _, _ in updatePulse() }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(caption)
        .accessibilityValue("\(displayValue) \(unit)")
        .accessibilityHint(freshness.accessibilityLabel)
        .dsDynamicTypeClamp()
    }

    private var displayValue: String {
        guard let value, !isUnavailable || freshness == .stale else {
            return Formatters.unavailable
        }
        return MetricFormatter.number(value, fractionLength: precision)
    }

    private var bottomCaption: String {
        if isUnavailable {
            return emptyReason
                ?? (freshness == .unavailable
                    ? String(localized: "data.notSupported", table: "Localizable")
                    : String(localized: "data.noData", table: "Localizable"))
        }
        return caption
    }

    private var valueColor: Color {
        if isUnavailable { return .contentTertiary }
        switch activeSemantic {
        case .attention, .critical: return activeSemantic.color
        default: return .contentPrimary
        }
    }

    private var ringOpacity: Double {
        if freshness == .stale { return 0.45 }
        if isUnavailable { return 1 }
        if activeSemantic == .critical { return pulse ? 0.7 : 1 }
        return 1
    }

    private func updatePulse() {
        guard activeSemantic == .critical, !reduceMotion, !isUnavailable else {
            pulse = false
            return
        }
        withAnimation(MotionTokens.criticalPulse) { pulse = true }
    }

    private func drawGauge(context: GraphicsContext, size canvasSize: CGSize) {
        let center = CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
        let trackW = resolvedTrackWidth
        let radius = min(canvasSize.width, canvasSize.height) / 2 - trackW / 2 - 4 * scale
        let trackOpacity: Double = isUnavailable ? 0.4 : 1

        // Track
        var track = Path()
        track.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(startDegrees),
            endAngle: .degrees(startDegrees + sweepDegrees),
            clockwise: false
        )
        context.stroke(
            track,
            with: .color(Color.hairline.opacity(trackOpacity)),
            style: StrokeStyle(lineWidth: trackW, lineCap: .round)
        )

        // Zone marks — 3pt outside track, 8pt long
        let markOuter = radius + trackW / 2 + 3 * scale
        let markInner = markOuter - 8 * scale
        for zone in zones.dropLast() {
            let p = progress(of: zone.to)
            let angle = Angle.degrees(startDegrees + sweepDegrees * p).radians
            var mark = Path()
            mark.move(to: CGPoint(
                x: center.x + cos(angle) * markInner,
                y: center.y + sin(angle) * markInner
            ))
            mark.addLine(to: CGPoint(
                x: center.x + cos(angle) * markOuter,
                y: center.y + sin(angle) * markOuter
            ))
            context.stroke(mark, with: .color(zone.semantic.color.opacity(0.6)), lineWidth: 1.5 * scale)
        }

        // Ticks: major every range/6, minor every range/24
        let span = range.upperBound - range.lowerBound
        let majorStep = span / 6
        let minorStep = span / 24
        if majorStep > 0, minorStep > 0 {
            var v = range.lowerBound
            var i = 0
            while v <= range.upperBound + 0.0001 {
                let p = progress(of: v)
                let isMajor = abs(v.truncatingRemainder(dividingBy: majorStep)) < 0.0001
                    || abs(v - range.lowerBound) < 0.0001
                    || abs(v - range.upperBound) < 0.0001
                // Use index-based major: every 4th minor
                let major = i % 4 == 0
                let length: CGFloat = (major ? 9 : 4) * scale
                let opacity: Double = major ? 1 : 0.35
                let angle = Angle.degrees(startDegrees + sweepDegrees * p).radians
                let outerR = radius - trackW / 2 - 2 * scale
                var tick = Path()
                tick.move(to: CGPoint(
                    x: center.x + cos(angle) * (outerR - length),
                    y: center.y + sin(angle) * (outerR - length)
                ))
                tick.addLine(to: CGPoint(
                    x: center.x + cos(angle) * outerR,
                    y: center.y + sin(angle) * outerR
                ))
                context.stroke(
                    tick,
                    with: .color(Color.contentTertiary.opacity(opacity)),
                    lineWidth: (major ? 1.5 : 1) * scale
                )
                v += minorStep
                i += 1
                _ = isMajor
            }
        }

        // Value arc
        guard !isUnavailable, normalized > 0 else { return }
        var valueArc = Path()
        valueArc.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(startDegrees),
            endAngle: .degrees(startDegrees + sweepDegrees * normalized),
            clockwise: false
        )
        context.stroke(
            valueArc,
            with: .color(activeSemantic.color),
            style: StrokeStyle(lineWidth: trackW, lineCap: .round)
        )
    }

    private func progress(of value: Double) -> Double {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return min(max((value - range.lowerBound) / span, 0), 1)
    }
}

#Preview("GaugeRing states") {
    ScrollView {
        VStack(spacing: 24) {
            GaugeRing(value: 53, range: 0...220, zones: GaugeZone.speedZones(), unit: "km/h", caption: "Speed")
            GaugeRing(value: 165, range: 0...220, zones: GaugeZone.speedZones(), unit: "km/h", caption: "Speed")
            GaugeRing(value: 195, range: 0...220, zones: GaugeZone.speedZones(), unit: "km/h", caption: "Speed")
            GaugeRing(value: nil, range: 0...220, zones: GaugeZone.speedZones(), unit: "km/h", caption: "Speed", freshness: .unavailable)
            GaugeRing(value: 53, range: 0...220, zones: GaugeZone.speedZones(), unit: "km/h", caption: "Speed", freshness: .stale)
        }
        .padding()
        .background(Color.canvas)
    }
}
