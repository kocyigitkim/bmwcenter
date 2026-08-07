import Foundation

enum CSVExporter {
    static let tripHeader = "id,started_at,ended_at,distance_km,duration_s,moving_s,idle_s,fuel_l,idle_fuel_l,avg_l_100km,avg_speed_kmh,max_speed_kmh,max_rpm,score,category,start_place,end_place,data_source"

    static func exportTrips(_ trips: [Trip]) -> URL? {
        let iso = ISO8601DateFormatter()
        var rows = [tripHeader]
        for t in trips {
            let ended = t.endedAt.map { iso.string(from: $0) } ?? ""
            let fields: [String] = [
                t.id.uuidString,
                iso.string(from: t.startedAt),
                ended,
                posix(t.distanceKm),
                posix(t.durationS),
                posix(t.movingDurationS),
                posix(t.idleDurationS),
                posix(t.fuelUsedL),
                posix(t.idleFuelL),
                posix(t.avgL100),
                posix(t.avgSpeedKmh),
                posix(t.maxSpeedKmh),
                posix(t.maxRpm),
                t.scoreTotal.map(posix) ?? "",
                quote(t.categoryRaw),
                quote(t.startPlaceName ?? ""),
                quote(t.endPlaceName ?? ""),
                quote(t.dataSource)
            ]
            rows.append(fields.joined(separator: ","))
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("trips-\(Int(Date().timeIntervalSince1970)).csv")
        do {
            try rows.joined(separator: "\n").write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            Log.error("CSV export failed: \(error)")
            return nil
        }
    }

    private static func posix(_ value: Double) -> String {
        String(format: "%.6f", locale: Locale(identifier: "en_US_POSIX"), value)
    }

    private static func quote(_ value: String) -> String {
        "\"\(value.replacingOccurrences(of: "\"", with: "\"\""))\""
    }
}
