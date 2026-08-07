import SwiftUI
import MapKit

struct TripMapView: View {
    let trip: Trip

    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        let coords = RouteSimplifier.decode(trip.routeData)
        Map(position: $position) {
            if coords.count >= 2 {
                MapPolyline(coordinates: coords)
                    .stroke(Color("accent/blue"), lineWidth: 4)
            }
            if let start = coords.first {
                Annotation(String(localized: "trip.startedAt", table: "Localizable"), coordinate: start) {
                    Image(systemName: "flag.fill")
                        .foregroundStyle(Color("state/ok"))
                }
            }
            if let end = coords.last, coords.count > 1 {
                Annotation(String(localized: "trip.endedAt", table: "Localizable"), coordinate: end) {
                    Image(systemName: "flag.checkered")
                        .foregroundStyle(Color("accent/red"))
                }
            }
            ForEach(eventAnnotations, id: \.id) { item in
                Annotation(item.title, coordinate: item.coordinate) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(Color("state/warn"))
                        .font(.system(size: 12))
                }
            }
        }
        .frame(minHeight: 220)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onAppear {
            if coords.count >= 2 {
                let region = regionFitting(coords)
                position = .region(region)
            }
        }
    }

    private var eventAnnotations: [(id: String, title: String, coordinate: CLLocationCoordinate2D)] {
        (trip.events ?? []).compactMap { event in
            guard let lat = event.latitude, let lon = event.longitude else { return nil }
            return (
                id: "\(event.typeRaw)-\(event.t.timeIntervalSince1970)",
                title: event.typeRaw,
                coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon)
            )
        }
    }

    private func regionFitting(_ coords: [CLLocationCoordinate2D]) -> MKCoordinateRegion {
        var minLat = coords[0].latitude
        var maxLat = coords[0].latitude
        var minLon = coords[0].longitude
        var maxLon = coords[0].longitude
        for c in coords {
            minLat = min(minLat, c.latitude)
            maxLat = max(maxLat, c.latitude)
            minLon = min(minLon, c.longitude)
            maxLon = max(maxLon, c.longitude)
        }
        let center = CLLocationCoordinate2D(
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2
        )
        let span = MKCoordinateSpan(
            latitudeDelta: max((maxLat - minLat) * 1.4, 0.01),
            longitudeDelta: max((maxLon - minLon) * 1.4, 0.01)
        )
        return MKCoordinateRegion(center: center, span: span)
    }
}
