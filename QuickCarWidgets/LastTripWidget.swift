import WidgetKit
import SwiftUI

struct LastTripEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct LastTripProvider: TimelineProvider {
    func placeholder(in context: Context) -> LastTripEntry {
        LastTripEntry(date: .now, snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (LastTripEntry) -> Void) {
        completion(LastTripEntry(date: .now, snapshot: WidgetDataStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<LastTripEntry>) -> Void) {
        let entry = LastTripEntry(date: .now, snapshot: WidgetDataStore.load())
        completion(Timeline(entries: [entry], policy: .atEnd))
    }
}

struct LastTripWidgetView: View {
    var entry: LastTripEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        HStack(spacing: 14) {
            miniScore
            VStack(alignment: .leading, spacing: 4) {
                if let snap = entry.snapshot, let distance = snap.lastTripDistanceKm {
                    Text(String(format: "%.1f km", distance))
                        .font(.system(size: family == .systemSmall ? 26 : 28, weight: .bold, design: .rounded).monospacedDigit())
                    if family == .systemMedium {
                        HStack(spacing: 10) {
                            if let duration = snap.lastTripDurationS {
                                Text(formatDuration(duration))
                            }
                            if let l100 = snap.lastTripL100 {
                                Text(String(format: "%.1f L/100", l100))
                            }
                            if let score = snap.lastTripScore {
                                Text("\(Int(score.rounded()))")
                            }
                        }
                        .font(.caption.weight(.medium))
                        .foregroundStyle(.secondary)
                    } else if let duration = snap.lastTripDurationS {
                        Text(formatDuration(duration))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("—")
                        .font(.largeTitle.weight(.bold))
                }
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var miniScore: some View {
        let score = entry.snapshot?.lastTripScore ?? 0
        return ZStack {
            Circle().stroke(Color.secondary.opacity(0.25), lineWidth: 5)
            Circle()
                .trim(from: 0, to: CGFloat(min(max(score / 100, 0), 1)))
                .stroke(Color.blue, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text(entry.snapshot?.lastTripScore.map { "\(Int($0.rounded()))" } ?? "—")
                .font(.system(size: 12, weight: .bold, design: .rounded).monospacedDigit())
        }
        .frame(width: 48, height: 48)
    }

    private func formatDuration(_ s: Double) -> String {
        let m = Int(s) / 60
        let sec = Int(s) % 60
        return String(format: "%d:%02d", m, sec)
    }
}

struct LastTripWidget: Widget {
    let kind = "LastTripWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LastTripProvider()) { entry in
            LastTripWidgetView(entry: entry)
        }
        .configurationDisplayName("Last trip")
        .description("Distance, duration, consumption and score.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
