import Foundation

/// Bundled catalog (Resources/VehicleProfilePack.json) — model + marka katmanı.
/// Uzaktan güncellenebilir paket formatına yakın ama şimdilik app bundle'dan yüklenir.
struct VehicleProfilePack: Codable, Sendable {
    struct ModelEntry: Codable, Sendable {
        var id: String
        var make: String
        var model: String
        var matchModel: [String]
        var matchEngine: [String]
        var archetype: VehicleArchetype
        var tstat: Double
        var mapControlled: Bool
        var capBar: Double
        var batteryChem: VehicleDiagnosticProfile.BatteryChem
        var smartAlternator: Bool
        var confidence: Confidence
        var flags: [String]?
        var engineLabel: String?
        var yearFrom: Int?
        var yearTo: Int?
        var tankL: Double?
        var displacementL: Double?
        var fuel: FuelType?
        var pidPack: VehiclePlatform?

        var resolvedPIDPack: VehiclePlatform { pidPack ?? .universal }
        var resolvedFuel: FuelType { fuel ?? archetype.defaultFuel }
        var resolvedIsTurbo: Bool { archetype.defaultIsTurbo }
        var resolvedEngineLabel: String {
            if let engineLabel, !engineLabel.isEmpty { return engineLabel }
            if let first = matchEngine.first, !first.isEmpty { return first.uppercased() }
            return archetype.rawValue
        }
        var resolvedDisplacementL: Double { displacementL ?? 1.6 }
        var resolvedTankL: Double { tankL ?? 50 }
    }

    struct BrandEntry: Codable, Sendable {
        var make: String
        var archetype: VehicleArchetype
        var tstat: Double
        var mapControlled: Bool
        var capBar: Double
        var batteryChem: VehicleDiagnosticProfile.BatteryChem
        var smartAlternator: Bool
        var confidence: Confidence
    }

    var schemaVersion: Int
    var packVersion: String
    var models: [ModelEntry]
    var brands: [BrandEntry]

    static func loadBundled() -> VehicleProfilePack? {
        guard let url = Bundle.main.url(forResource: "VehicleProfilePack", withExtension: "json"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? decode(data)
    }

    static func decode(_ data: Data) throws -> VehicleProfilePack {
        try JSONDecoder().decode(VehicleProfilePack.self, from: data)
    }
}

extension VehicleDiagnosticProfile {
    /// Arketip varsayılanı üstüne katalog satırından gelen doğrulanmış alanları bindirir.
    static func from(modelEntry e: VehicleProfilePack.ModelEntry, fuel: FuelType, isTurbo: Bool) -> VehicleDiagnosticProfile {
        var p = VehicleArchetypeDefaults.profile(for: e.archetype, fuel: fuel, isTurbo: isTurbo)
        p.id = e.id
        p.make = e.make
        p.model = e.model
        p.fuel = fuel
        p.displacementL = e.resolvedDisplacementL
        p.pidPack = e.resolvedPIDPack
        p.overallConfidence = e.confidence
        p.thermostatOpenC = ProfileField(e.tstat, confidence: e.confidence, source: "service")
        p.mapControlledThermostat = ProfileField(e.mapControlled, confidence: e.confidence, source: "service")
        p.capPressureBar = ProfileField(e.capBar, confidence: e.confidence, source: "service")
        p.batteryChem = e.batteryChem
        p.smartAlternator = e.smartAlternator
        if let year = e.yearFrom { p.modelYear = year }
        if let flags = e.flags { p.flags.formUnion(flags) }
        return p
    }

    static func from(brandEntry e: VehicleProfilePack.BrandEntry, fuel: FuelType, isTurbo: Bool) -> VehicleDiagnosticProfile {
        var p = VehicleArchetypeDefaults.profile(for: e.archetype, fuel: fuel, isTurbo: isTurbo)
        p.id = "brand.\(VehicleMakeAliases.slug(e.make))"
        p.make = e.make
        p.model = VehicleProfileCatalog.otherModel
        p.fuel = fuel
        p.pidPack = .universal
        p.overallConfidence = e.confidence
        p.thermostatOpenC = ProfileField(e.tstat, confidence: e.confidence, source: "brand")
        p.mapControlledThermostat = ProfileField(e.mapControlled, confidence: e.confidence, source: "brand")
        p.capPressureBar = ProfileField(e.capBar, confidence: e.confidence, source: "brand")
        p.batteryChem = e.batteryChem
        p.smartAlternator = e.smartAlternator
        return p
    }
}
