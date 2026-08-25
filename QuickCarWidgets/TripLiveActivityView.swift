import ActivityKit
import WidgetKit
import SwiftUI

struct TripLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TripActivityAttributes.self) { context in
            HStack(spacing: 0) {
                Rectangle()
                    .fill(statusColor(context.state))
                    .frame(width: 4)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(formatDuration(context.state.durationS))
                            .font(.system(size: 26, weight: .semibold, design: .rounded).monospacedDigit())
                        Text(String(format: "%.1f km · %.1f L/100", context.state.distanceKm, context.state.avgL100))
                            .font(.caption.weight(.medium))
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Link(destination: URL(string: "quickcar://stop-trip")!) {
                        Text("Stop")
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(.ultraThinMaterial, in: Capsule())
                    }
                }
                .padding()
            }
            .activityBackgroundTint(.black.opacity(0.85))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(String(format: "%.0f", context.state.speedKmh))
                        .font(.title3.weight(.bold).monospacedDigit())
                    Text("km/h").font(.caption2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(String(format: "%.1f km", context.state.distanceKm))
                        .font(.caption.monospacedDigit())
                    Text(formatDuration(context.state.durationS))
                        .font(.caption2.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(String(format: "%.1f L/100", context.state.avgL100))
                        .font(.caption.monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(String(format: "%.2f L", context.state.fuelUsedL))
                        Spacer()
                        Text(String(format: "%.0f km/h", context.state.speedKmh))
                        Spacer()
                        Link(destination: URL(string: "quickcar://stop-trip")!) {
                            Label("Stop", systemImage: "stop.fill")
                        }
                    }
                    .font(.caption.weight(.semibold))
                }
            } compactLeading: {
                Text(String(format: "%.0f", context.state.speedKmh))
                    .font(.caption2.monospacedDigit())
            } compactTrailing: {
                Text(String(format: "%.1f", context.state.distanceKm))
                    .font(.caption2.monospacedDigit())
            } minimal: {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: "road.lanes")
                    Circle()
                        .fill(Color.green)
                        .frame(width: 5, height: 5)
                        .offset(x: 2, y: -2)
                }
            }
        }
    }

    private func formatDuration(_ s: Double) -> String {
        let total = max(0, Int(s.rounded()))
        let h = total / 3600
        let m = (total % 3600) / 60
        let sec = total % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, sec) }
        return String(format: "%02d:%02d", m, sec)
    }

    private func statusColor(_ state: TripActivityAttributes.ContentState) -> Color {
        if state.speedKmh > 160 { return .red }
        if state.avgL100 > 15 { return .orange }
        return .green
    }
}
