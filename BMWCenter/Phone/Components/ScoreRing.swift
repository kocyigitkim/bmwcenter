import SwiftUI

struct ScoreRing: View {
    let score: Double?
    var breakdown: ScoreBreakdown? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var animatedProgress: CGFloat = 0

    private let diameter: CGFloat = 148
    private let lineWidth: CGFloat = 14
    private let sweep: Double = 300

    var body: some View {
        VStack(spacing: DSSpace.s3) {
            ZStack {
                // Soft brand glow
                RadialGradient(
                    colors: [Color.brandPrimary.opacity(0.12), .clear],
                    center: .center,
                    startRadius: 10,
                    endRadius: 90
                )
                .frame(width: 200, height: 200)

                Canvas { context, size in
                    let center = CGPoint(x: size.width / 2, y: size.height / 2)
                    let radius = min(size.width, size.height) / 2 - lineWidth / 2
                    let start = Angle.degrees(120)

                    var track = Path()
                    track.addArc(center: center, radius: radius, startAngle: start, endAngle: start + .degrees(sweep), clockwise: false)
                    context.stroke(track, with: .color(Color.hairline), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

                    var value = Path()
                    value.addArc(
                        center: center,
                        radius: radius,
                        startAngle: start,
                        endAngle: start + .degrees(sweep * Double(animatedProgress)),
                        clockwise: false
                    )
                    context.stroke(
                        value,
                        with: .linearGradient(
                            Gradient(colors: [.brandPrimary, .brandSecondary]),
                            startPoint: CGPoint(x: 0, y: 0),
                            endPoint: CGPoint(x: size.width, y: size.height)
                        ),
                        style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                    )
                }
                .frame(width: diameter, height: diameter)

                VStack(spacing: 4) {
                    Text(score.map { "\(Int($0.rounded()))" } ?? Formatters.unavailable)
                        .font(DSFont.display())
                        .dsMetricDigit()
                        .foregroundStyle(Color.contentPrimary)
                    Text(badge)
                        .font(DSFont.caption())
                        .foregroundStyle(Color.contentSecondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.surface2, in: Capsule())
                }

                // 6 micro segments outside ring
                if let breakdown {
                    microSegments(breakdown)
                        .frame(width: diameter + 28, height: diameter + 28)
                }
            }

            if let breakdown {
                VStack(spacing: 8) {
                    componentBar(String(localized: "score.acceleration", table: "Localizable"), breakdown.acceleration, 25, .semNominal)
                    componentBar(String(localized: "score.braking", table: "Localizable"), breakdown.braking, 25, .semAttention)
                    componentBar(String(localized: "score.cornering", table: "Localizable"), breakdown.cornering, 10, .semInfo)
                    componentBar(String(localized: "score.speed", table: "Localizable"), breakdown.speed, 15, .semCold)
                    componentBar(String(localized: "score.idle", table: "Localizable"), breakdown.idle, 10, .semAttention)
                    componentBar(String(localized: "score.efficiency", table: "Localizable"), breakdown.efficiency, 15, .brandPrimary)
                }
                .padding(.horizontal, DSSpace.s2)
            }
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            let target = CGFloat((score ?? 0) / 100)
            if let anim = MotionTokens.scoreFill(reduceMotion: reduceMotion) {
                withAnimation(anim) { animatedProgress = target }
            } else {
                animatedProgress = target
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "score.title", table: "Localizable"))
        .accessibilityValue(score.map { "\(Int($0.rounded())), \(badge)" } ?? Formatters.unavailable)
    }

    private var badge: String {
        guard let score else { return Formatters.unavailable }
        let key: String
        switch score {
        case 90...: key = "score.badge.smooth"
        case 75..<90: key = "score.badge.steady"
        case 60..<75: key = "score.badge.mixed"
        default: key = "score.badge.aggressive"
        }
        return String(localized: String.LocalizationValue(key), table: "Localizable")
    }

    private func componentBar(_ title: String, _ value: Double, _ ceiling: Double, _ color: Color) -> some View {
        HStack(spacing: 8) {
            Text(title)
                .font(DSFont.caption())
                .foregroundStyle(Color.contentSecondary)
                .frame(width: 88, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.surface2)
                    Capsule()
                        .fill(color)
                        .frame(width: geo.size.width * CGFloat(Swift.min(Swift.max(value / ceiling, 0), 1)))
                }
            }
            .frame(height: 6)
            Text("\(Int(value.rounded()))")
                .font(DSFont.caption())
                .dsMetricDigit()
                .foregroundStyle(Color.contentTertiary)
                .frame(width: 24, alignment: .trailing)
        }
    }

    private func microSegments(_ b: ScoreBreakdown) -> some View {
        let parts: [(Double, Double)] = [
            (b.acceleration, 25), (b.braking, 25), (b.cornering, 10),
            (b.speed, 15), (b.idle, 10), (b.efficiency, 15)
        ]
        return Canvas { context, size in
            let center = CGPoint(x: size.width / 2, y: size.height / 2)
            let radius = Swift.min(size.width, size.height) / 2 - 2
            let segmentSweep = 40.0
            let gap = 8.0
            var angle = 120.0
            for (value, ceiling) in parts {
                let fill = Swift.min(Swift.max(value / ceiling, 0), 1)
                var path = Path()
                path.addArc(
                    center: center,
                    radius: radius,
                    startAngle: .degrees(angle),
                    endAngle: .degrees(angle + segmentSweep * fill),
                    clockwise: false
                )
                context.stroke(path, with: .color(Color.brandPrimary.opacity(0.55)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                angle += segmentSweep + gap
            }
        }
        .allowsHitTesting(false)
    }
}

/// Compatibility alias
typealias ScoreRingView = ScoreRing
