import WidgetKit
import SwiftUI

struct FuelLevelEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
}

struct FuelLevelProvider: TimelineProvider {
    func placeholder(in context: Context) -> FuelLevelEntry {
        FuelLevelEntry(date: .now, snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (FuelLevelEntry) -> Void) {
        completion(FuelLevelEntry(date: .now, snapshot: WidgetDataStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FuelLevelEntry>) -> Void) {
        let entry = FuelLevelEntry(date: .now, snapshot: WidgetDataStore.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: .now) ?? .now.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct FuelLevelWidgetView: View {
    var entry: FuelLevelEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        HStack(spacing: 12) {
            verticalCapsule
                .frame(width: 22, height: family == .systemSmall ? 72 : 88)

            VStack(alignment: .leading, spacing: 4) {
                Text(pctText)
                    .font(.system(size: family == .systemSmall ? 34 : 42, weight: .bold, design: .rounded).monospacedDigit())
                if let range = entry.snapshot?.estimatedRangeKm {
                    Text(String(format: "%.0f km", range))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if family == .systemMedium {
                    Text(entry.date.formatted(date: .omitted, time: .shortened))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .padding(.top, 6)
                }
                Spacer(minLength: 0)
            }
            Spacer(minLength: 0)
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var verticalCapsule: some View {
        GeometryReader { geo in
            let level = (entry.snapshot?.fuelLevelPct ?? 0) / 100
            let h = geo.size.height * min(max(level, 0), 1)
            ZStack(alignment: .bottom) {
                Capsule().fill(Color.secondary.opacity(0.2))
                Capsule()
                    .fill(level < 0.15 ? Color.orange : Color.green)
                    .frame(height: max(h, 0))
            }
        }
    }

    private var pctText: String {
        guard let pct = entry.snapshot?.fuelLevelPct else { return "—" }
        return "\(Int(pct.rounded()))%"
    }
}

struct FuelLevelWidget: Widget {
    let kind = "FuelLevelWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FuelLevelProvider()) { entry in
            FuelLevelWidgetView(entry: entry)
        }
        .configurationDisplayName("Fuel level")
        .description("Tank level and estimated range.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
