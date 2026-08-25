import SwiftUI

struct AlertChipRow: View {
    let alerts: [ActiveAlert]
    var onSelect: ((ActiveAlert) -> Void)? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    var body: some View {
        if !alerts.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: DSSpace.s2) {
                    ForEach(sorted) { alert in
                        Button {
                            onSelect?(alert)
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: symbol(for: alert.severity))
                                    .font(.system(size: 12, weight: .semibold))
                                    .layoutPriority(1)
                                Text(alert.title)
                                    .font(DSFont.caption())
                                    .lineLimit(1)
                                    .fixedSize(horizontal: true, vertical: false)
                            }
                            .foregroundStyle(Color.contentPrimary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .overlay(
                                Capsule()
                                    .strokeBorder(color(for: alert.severity).opacity(0.85), lineWidth: 1)
                            )
                            .glassSurface(.chip)
                            .opacity(alert.severity == .critical && pulse ? 0.7 : 1)
                        }
                        .buttonStyle(.plain)
                        .fixedSize(horizontal: true, vertical: false)
                    }
                }
                .padding(.horizontal, DSSpace.screenEdge)
            }
            .transition(reduceMotion ? .opacity : .push(from: .top))
            .onAppear {
                if alerts.contains(where: { $0.severity == .critical }), !reduceMotion {
                    withAnimation(MotionTokens.criticalPulse) { pulse = true }
                }
            }
        }
    }

    private var sorted: [ActiveAlert] {
        alerts.sorted { lhs, rhs in
            if lhs.severity == .critical && rhs.severity != .critical { return true }
            if rhs.severity == .critical && lhs.severity != .critical { return false }
            return lhs.title < rhs.title
        }
    }

    private func color(for severity: AlertSeverity) -> Color {
        switch severity {
        case .info: .semInfo
        case .warning: .semAttention
        case .critical: .semCritical
        }
    }

    private func symbol(for severity: AlertSeverity) -> String {
        switch severity {
        case .info: "info.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .critical: "exclamationmark.octagon.fill"
        }
    }
}

// Re-export types previously in AlertStrip
struct ActiveAlert: Identifiable, Equatable {
    let id: String
    let title: String
    let severity: AlertSeverity
}

enum AlertSeverity: String, Sendable {
    case info, warning, critical
}
