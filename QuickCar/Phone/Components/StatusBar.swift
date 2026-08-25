import SwiftUI

struct StatusBar: View {
    let progress: Double
    let zones: [GaugeZone]
    var showZoneMarks: Bool = true
    var value: Double? = nil
    var range: ClosedRange<Double> = 0...1

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var clamped: Double { min(max(progress, 0), 1) }

    private var fillSemantic: SemanticColor {
        if let value {
            return GaugeZone.semantic(for: value, in: zones)
        }
        let mapped = range.lowerBound + (range.upperBound - range.lowerBound) * clamped
        return GaugeZone.semantic(for: mapped, in: zones)
    }

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: DSRadius.bar, style: .continuous)
                    .fill(Color.surface2)

                RoundedRectangle(cornerRadius: DSRadius.bar, style: .continuous)
                    .fill(fillSemantic.color)
                    .frame(width: max(width * clamped, 0))
                    .animation(MotionTokens.barFill(reduceMotion: reduceMotion), value: clamped)

                if showZoneMarks {
                    ForEach(zones.dropLast()) { zone in
                        let p = progressOf(zone.to)
                        Rectangle()
                            .fill(Color.hairline.opacity(0.7))
                            .frame(width: 1.5, height: 8)
                            .offset(x: width * p - 0.75)
                    }
                }

                if fillSemantic == .attention || fillSemantic == .critical {
                    Circle()
                        .fill(Color.white.opacity(0.85))
                        .frame(width: 3, height: 3)
                        .offset(x: max(width * clamped - 4, 0), y: 0)
                }
            }
        }
        .frame(height: 8)
        .accessibilityHidden(true)
    }

    private func progressOf(_ v: Double) -> CGFloat {
        let span = range.upperBound - range.lowerBound
        guard span > 0 else { return 0 }
        return CGFloat(min(max((v - range.lowerBound) / span, 0), 1))
    }
}
