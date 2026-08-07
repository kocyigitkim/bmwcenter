import Foundation

struct GaugeZone: Equatable, Sendable, Identifiable {
    var id: String { "\(from)-\(to)-\(semantic.rawValue)" }
    let from: Double
    let to: Double
    let semantic: SemanticColor

    init(from: Double, to: Double, semantic: SemanticColor) {
        self.from = from
        self.to = to
        self.semantic = semantic
    }

    func contains(_ value: Double) -> Bool {
        value >= from && value <= to
    }

    static func semantic(for value: Double, in zones: [GaugeZone]) -> SemanticColor {
        zones.first(where: { $0.contains(value) })?.semantic ?? .nominal
    }

    // Common presets
    static func speedZones(max: Double = 220) -> [GaugeZone] {
        [
            .init(from: 0, to: 140, semantic: .nominal),
            .init(from: 140, to: 180, semantic: .attention),
            .init(from: 180, to: max, semantic: .critical)
        ]
    }

    static func rpmZones(max: Double = 7000) -> [GaugeZone] {
        [
            .init(from: 0, to: 5500, semantic: .nominal),
            .init(from: 5500, to: 6500, semantic: .attention),
            .init(from: 6500, to: max, semantic: .critical)
        ]
    }

    static func coolantZones(celsius: Bool) -> [GaugeZone] {
        if celsius {
            return [
                .init(from: 0, to: 70, semantic: .cold),
                .init(from: 70, to: 105, semantic: .nominal),
                .init(from: 105, to: 110, semantic: .attention),
                .init(from: 110, to: 160, semantic: .critical)
            ]
        }
        return [
            .init(from: 32, to: 158, semantic: .cold),
            .init(from: 158, to: 221, semantic: .nominal),
            .init(from: 221, to: 230, semantic: .attention),
            .init(from: 230, to: 320, semantic: .critical)
        ]
    }

    static func fuelZones() -> [GaugeZone] {
        [
            .init(from: 0, to: 8, semantic: .critical),
            .init(from: 8, to: 15, semantic: .attention),
            .init(from: 15, to: 100, semantic: .nominal)
        ]
    }

    static func percentZones() -> [GaugeZone] {
        [
            .init(from: 0, to: 100, semantic: .nominal)
        ]
    }

    static func voltageZones() -> [GaugeZone] {
        [
            .init(from: 0, to: 11.5, semantic: .critical),
            .init(from: 11.5, to: 12.2, semantic: .attention),
            .init(from: 12.2, to: 15.5, semantic: .nominal),
            .init(from: 15.5, to: 18, semantic: .attention)
        ]
    }
}
