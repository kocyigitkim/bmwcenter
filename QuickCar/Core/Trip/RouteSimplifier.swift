import Foundation
import CoreLocation

enum RouteSimplifier {
    static func simplify(_ points: [CLLocationCoordinate2D], epsilonMeters: Double = 12, maxPoints: Int = 500) -> [CLLocationCoordinate2D] {
        guard points.count > 2 else { return points }
        var simplified = douglasPeucker(points, epsilon: epsilonMeters)
        if simplified.count > maxPoints {
            let step = Double(simplified.count - 1) / Double(maxPoints - 1)
            var sampled: [CLLocationCoordinate2D] = []
            for i in 0..<maxPoints {
                sampled.append(simplified[Int((Double(i) * step).rounded())])
            }
            simplified = sampled
        }
        return simplified
    }

    static func encode(_ points: [CLLocationCoordinate2D]) -> Data {
        var data = Data(capacity: points.count * 16)
        for p in points {
            var lat = p.latitude
            var lon = p.longitude
            withUnsafeBytes(of: &lat) { data.append(contentsOf: $0) }
            withUnsafeBytes(of: &lon) { data.append(contentsOf: $0) }
        }
        return data
    }

    static func decode(_ data: Data?) -> [CLLocationCoordinate2D] {
        guard let data, data.count >= 16 else { return [] }
        var result: [CLLocationCoordinate2D] = []
        result.reserveCapacity(data.count / 16)
        data.withUnsafeBytes { raw in
            let doubles = raw.bindMemory(to: Double.self)
            var i = 0
            while i + 1 < doubles.count {
                result.append(CLLocationCoordinate2D(latitude: doubles[i], longitude: doubles[i + 1]))
                i += 2
            }
        }
        return result
    }

    private static func douglasPeucker(_ points: [CLLocationCoordinate2D], epsilon: Double) -> [CLLocationCoordinate2D] {
        guard points.count > 2 else { return points }
        var maxDistance: Double = 0
        var index = 0
        let start = points.first!
        let end = points.last!
        for i in 1..<(points.count - 1) {
            let d = perpendicularDistance(points[i], start: start, end: end)
            if d > maxDistance {
                maxDistance = d
                index = i
            }
        }
        if maxDistance > epsilon {
            let left = douglasPeucker(Array(points[...index]), epsilon: epsilon)
            let right = douglasPeucker(Array(points[index...]), epsilon: epsilon)
            return Array(left.dropLast()) + right
        }
        return [start, end]
    }

    private static func perpendicularDistance(_ point: CLLocationCoordinate2D, start: CLLocationCoordinate2D, end: CLLocationCoordinate2D) -> Double {
        let a = CLLocation(latitude: start.latitude, longitude: start.longitude)
        let b = CLLocation(latitude: end.latitude, longitude: end.longitude)
        let p = CLLocation(latitude: point.latitude, longitude: point.longitude)
        let ab = a.distance(from: b)
        guard ab > 0 else { return a.distance(from: p) }
        let area = abs(
            (end.longitude - start.longitude) * (start.latitude - point.latitude)
            - (start.longitude - point.longitude) * (end.latitude - start.latitude)
        )
        // Approximate meters using degree→meter factor near mid latitude
        let metersPerDeg = 111_320.0
        return (area * metersPerDeg) / max(ab, 1)
    }
}
