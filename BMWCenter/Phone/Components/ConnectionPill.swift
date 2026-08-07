import SwiftUI

struct ConnectionPill: View {
    let connection: OBDConnectionState
    var isMock: Bool = false
    let onTap: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Namespace private var glassNS
    var compact: Bool = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 8) {
                leadingIndicator
                if !compact {
                    Text(label)
                        .font(DSFont.label())
                        .foregroundStyle(Color.contentPrimary)
                        .lineLimit(1)
                        .contentTransition(.opacity)
                }
            }
            .padding(.horizontal, compact ? 10 : 14)
            .padding(.vertical, compact ? 8 : 10)
            .frame(minHeight: 36)
        }
        .buttonStyle(.plain)
        .glassSurface(glassKind)
        .scaleEffect(compact ? 0.86 : 1)
        .animation(MotionTokens.glassMorph(reduceMotion: reduceMotion), value: compact)
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private var leadingIndicator: some View {
        switch connection {
        case .scanning, .connecting, .initializing:
            ProgressView()
                .controlSize(.mini)
                .tint(Color.semAttention)
        default:
            Circle()
                .fill(dotColor)
                .frame(width: 8, height: 8)
        }
    }

    private var label: String {
        if isMock {
            return String(localized: "connection.simulated", table: "Localizable")
        }
        switch connection {
        case .connected(let name):
            return "\(String(localized: "connection.connected", table: "Localizable")) · \(name)"
        case .scanning:
            return String(localized: "connection.scanning", table: "Localizable")
        case .connecting, .initializing:
            return String(localized: "connection.connecting", table: "Localizable")
        case .failed(.bluetoothOff):
            return String(localized: "connection.bluetoothOff", table: "Localizable")
        default:
            return String(localized: "connection.tapToFix", table: "Localizable")
        }
    }

    private var dotColor: Color {
        if isMock { return .semInfo }
        switch connection {
        case .connected: return .semNominal
        case .scanning, .connecting, .initializing: return .semAttention
        default: return .semCritical
        }
    }

    private var glassKind: GlassSurface.Kind {
        switch connection {
        case .connected:
            return .chip
        case .scanning, .connecting, .initializing:
            return isMock ? .chip : .chip
        default:
            return .tinted(.semCritical.opacity(0.7))
        }
    }
}
