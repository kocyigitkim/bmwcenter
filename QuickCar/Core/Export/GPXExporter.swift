import Foundation
import CoreLocation

enum GPXExporter {
    static func export(trip: Trip) -> URL? {
        let coords = RouteSimplifier.decode(trip.routeData)
        let iso = ISO8601DateFormatter()
        var gpx = """
        <?xml version="1.0" encoding="UTF-8"?>
        <gpx version="1.1" creator="QuickCar" xmlns="http://www.topografix.com/GPX/1/1">
        <trk><name>\(trip.id.uuidString)</name><trkseg>
        """
        for (index, c) in coords.enumerated() {
            let t = trip.startedAt.addingTimeInterval(Double(index))
            gpx += "<trkpt lat=\"\(c.latitude)\" lon=\"\(c.longitude)\"><time>\(iso.string(from: t))</time></trkpt>\n"
        }
        gpx += "</trkseg></trk></gpx>"
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("trip-\(trip.id.uuidString).gpx")
        do {
            try gpx.write(to: url, atomically: true, encoding: .utf8)
            return url
        } catch {
            Log.error("GPX export failed: \(error)")
            return nil
        }
    }
}
