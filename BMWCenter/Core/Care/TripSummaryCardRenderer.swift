import Foundation
import SwiftUI
import UIKit
import CoreLocation

@MainActor
final class TripSummaryCardRenderer {
    struct CardModel: Sendable {
        var vehicleName: String
        var date: Date
        var distanceKm: Double
        var durationS: Double
        var avgL100: Double
        var cost: Double
        var currencyCode: String
        var score: Double?
        var bestStretchKm: Double?
        var bestStretchL100: Double?
        var cleanWarmup: Bool
        var properCooldown: Bool
        var harshBrakes: Int
        var startCoord: CLLocationCoordinate2D?
        var endCoord: CLLocationCoordinate2D?
        var hideLocation: Bool
    }

    func shouldRender(distanceKm: Double) -> Bool {
        distanceKm >= 1.0
    }

    func bestStretch(samples: [TripSample]) -> (km: Double, l100: Double)? {
        guard samples.count >= 10 else { return nil }
        // Approximate distance from speed integration; find lowest avg fuel window ≥5 km
        var best: (Double, Double)?
        let window = 40
        guard samples.count >= window else { return nil }
        for i in 0...(samples.count - window) {
            let slice = Array(samples[i..<(i + window)])
            let fuel = slice.map(\.fuelRateLh).reduce(0, +) / 3600 // crude
            let dist = slice.map(\.speedKmh).reduce(0, +) / 3600
            guard dist >= 5 else { continue }
            let l100 = dist > 0.1 ? fuel / dist * 100 : 99
            if best == nil || l100 < best!.1 {
                best = (dist, l100)
            }
        }
        return best.map { ($0.0, $0.1) }
    }

    @MainActor
    func renderImage(model: CardModel) -> UIImage? {
        let view = TripSummaryCardView(model: model)
            .frame(width: 1080, height: 1350)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1
        return renderer.uiImage
    }
}

struct TripSummaryCardView: View {
    let model: TripSummaryCardRenderer.CardModel

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black, Color(red: 0.12, green: 0.14, blue: 0.18)],
                startPoint: .top,
                endPoint: .bottom
            )
            VStack(alignment: .leading, spacing: 28) {
                Text("\(model.vehicleName) · \(model.date.formatted(date: .abbreviated, time: .shortened))")
                    .font(.system(size: 36, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.9))
                if model.hideLocation {
                    RoundedRectangle(cornerRadius: 16)
                        .fill(.white.opacity(0.08))
                        .frame(height: 280)
                        .overlay(Text("Route").foregroundStyle(.white.opacity(0.4)))
                }
                HStack {
                    metric("\(String(format: "%.1f", model.distanceKm)) km")
                    Spacer()
                    metric(durationLabel)
                }
                HStack {
                    metric(String(format: "%.1f L/100km", model.avgL100))
                    Spacer()
                    metric(String(format: "%@ %.0f", model.currencyCode, model.cost))
                }
                if let score = model.score {
                    HStack {
                        Text("\(Int(score.rounded()))")
                            .font(.system(size: 72, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text(String(localized: "coach.liveScore", table: "Localizable"))
                            .foregroundStyle(.white.opacity(0.7))
                    }
                }
                if let km = model.bestStretchKm, let l100 = model.bestStretchL100 {
                    VStack(alignment: .leading) {
                        Text(String(localized: "card.bestStretch", table: "Localizable"))
                            .foregroundStyle(.white.opacity(0.6))
                        Text(String(format: "%.0f km at %.1f L/100km", km, l100))
                            .foregroundStyle(.white)
                    }
                }
                VStack(alignment: .leading, spacing: 8) {
                    if model.cleanWarmup {
                        Text("✓ \(String(localized: "cold.cleanWarmup", table: "Localizable"))")
                            .foregroundStyle(.green)
                    }
                    if model.properCooldown {
                        Text("✓ \(String(localized: "thermal.compliant", table: "Localizable"))")
                            .foregroundStyle(.green)
                    }
                    if model.harshBrakes > 0 {
                        Text("! \(model.harshBrakes) harsh brakes")
                            .foregroundStyle(.orange)
                    }
                }
                .font(.system(size: 28, weight: .medium))
                Spacer()
            }
            .padding(64)
        }
    }

    private var durationLabel: String {
        let m = Int(model.durationS / 60)
        return "\(m) min"
    }

    private func metric(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 40, weight: .semibold, design: .rounded))
            .foregroundStyle(.white)
    }
}
