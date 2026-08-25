import Foundation

enum VehicleProfileIDs {
    static let universalOBD2 = "universal.obd2"
    static let bmwF30N13 = "bmw.f30.n13"
    static let bmwFSeries = "bmw.fseries"
}

enum VehicleMakeAliases {
    static func slug(_ make: String) -> String {
        make.trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
    }

    static func canonical(_ raw: String, in pack: VehicleProfilePack? = nil) -> String {
        let aliased: String = {
            switch raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "ford europe": return "Ford"
            case "bmw m", "bmw i": return "BMW"
            case "citroen": return "Citroën"
            case "mercedes", "daimler": return "Mercedes-Benz"
            case "vw": return "Volkswagen"
            case "landrover": return "Land Rover"
            case "alfa": return "Alfa Romeo"
            default: return raw.trimmingCharacters(in: .whitespacesAndNewlines)
            }
        }()
        if let match = pack?.allMakes.first(where: { $0.caseInsensitiveCompare(aliased) == .orderedSame }) {
            return match
        }
        return aliased
    }
}

enum VehicleProfileMigration {
    static func profileId(from platform: VehiclePlatform) -> String {
        switch platform {
        case .universal: return VehicleProfileIDs.universalOBD2
        case .bmwF30N13: return VehicleProfileIDs.bmwF30N13
        case .bmwFSeries: return VehicleProfileIDs.bmwFSeries
        }
    }

    static func platform(forProfileId id: String, pack: VehicleProfilePack? = .loadBundled()) -> VehiclePlatform {
        VehicleProfileCatalog(pack: pack).choice(id: id)?.pidPack ?? .universal
    }
}

struct VehicleProfileChoice: Identifiable, Equatable, Sendable {
    var id: String
    var make: String
    var model: String
    var engineLabel: String
    var yearFrom: Int?
    var yearTo: Int?
    var archetype: VehicleArchetype
    var pidPack: VehiclePlatform
    var tankL: Double
    var displacementL: Double
    var fuel: FuelType
    var isTurbo: Bool

    var summary: String {
        if engineLabel.isEmpty { return "\(make) \(model)" }
        return "\(make) \(model) · \(engineLabel)"
    }

    var defaultDisplayName: String {
        if make == VehicleProfileCatalog.universalMake {
            return model
        }
        return "\(make) \(model)"
    }
}

struct VehicleProfileCatalog: Sendable {
    static let universalMake = "Universal"
    static let otherModel = "Other"

    let pack: VehicleProfilePack?

    init(pack: VehicleProfilePack? = .loadBundled()) {
        self.pack = pack
    }

    var makes: [String] {
        var seen = Set<String>()
        var rest: [String] = []
        for make in pack?.allMakes ?? [] {
            if make == Self.universalMake { continue }
            if seen.insert(make).inserted { rest.append(make) }
        }
        rest.sort { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
        return [Self.universalMake] + rest
    }

    func models(for make: String) -> [String] {
        let named = unique(
            (pack?.models ?? []).filter { $0.make.caseInsensitiveCompare(make) == .orderedSame }.map(\.model)
        )
        if make.caseInsensitiveCompare(Self.universalMake) == .orderedSame {
            return named.isEmpty ? ["Any car"] : named
        }
        if !named.contains(Self.otherModel) {
            return named + [Self.otherModel]
        }
        return named
    }

    func variants(make: String, model: String) -> [VehicleProfileChoice] {
        if model == Self.otherModel {
            return VehicleArchetype.allCases.map { genericChoice(make: make, archetype: $0) }
        }
        let rows = (pack?.models ?? []).filter {
            $0.make.caseInsensitiveCompare(make) == .orderedSame
                && $0.model.caseInsensitiveCompare(model) == .orderedSame
        }
        if rows.isEmpty, make.caseInsensitiveCompare(Self.universalMake) != .orderedSame {
            return VehicleArchetype.allCases.map { genericChoice(make: make, archetype: $0) }
        }
        return rows.map(choice(from:))
    }

    func choice(id: String) -> VehicleProfileChoice? {
        if let entry = pack?.models.first(where: { $0.id == id }) {
            return choice(from: entry)
        }
        if id.hasPrefix("brand."), let pack,
           let brand = pack.brands.first(where: { "brand.\(VehicleMakeAliases.slug($0.make))" == id }) {
            return choice(fromBrand: brand)
        }
        if id.hasPrefix("generic.") {
            return parseGenericId(id)
        }
        if id.hasPrefix("archetype."),
           let arch = VehicleArchetype(rawValue: String(id.dropFirst("archetype.".count))) {
            return genericChoice(make: Self.universalMake, archetype: arch)
        }
        if id == VehicleProfileIDs.universalOBD2 {
            return variants(make: Self.universalMake, model: "Any car").first
        }
        return nil
    }

    func choice(from entry: VehicleProfilePack.ModelEntry) -> VehicleProfileChoice {
        VehicleProfileChoice(
            id: entry.id,
            make: entry.make,
            model: entry.model,
            engineLabel: entry.resolvedEngineLabel,
            yearFrom: entry.yearFrom,
            yearTo: entry.yearTo,
            archetype: entry.archetype,
            pidPack: entry.resolvedPIDPack,
            tankL: entry.resolvedTankL,
            displacementL: entry.resolvedDisplacementL,
            fuel: entry.resolvedFuel,
            isTurbo: entry.resolvedIsTurbo
        )
    }

    func suggestion(vin: String) -> VehicleProfileChoice? {
        guard let info = VINDecoder.decode(vin) else { return nil }
        guard let manufacturer = info.manufacturer else {
            return choice(id: VehicleProfileIDs.universalOBD2)
        }
        let make = VehicleMakeAliases.canonical(manufacturer, in: pack)
        if let brand = pack?.brands.first(where: { $0.make.caseInsensitiveCompare(make) == .orderedSame }) {
            var suggested = choice(fromBrand: brand)
            if let year = info.modelYear {
                suggested.yearFrom = year
                suggested.yearTo = year
            }
            return suggested
        }
        if let first = pack?.models.first(where: { $0.make.caseInsensitiveCompare(make) == .orderedSame }) {
            return choice(from: first)
        }
        return choice(id: VehicleProfileIDs.universalOBD2)
    }

    func apply(_ choice: VehicleProfileChoice, to settings: AppSettings, year: Int? = nil) {
        settings.vehicleProfileId = choice.id
        settings.vehiclePlatform = choice.pidPack
        settings.fuelType = choice.fuel
        settings.isTurbo = choice.isTurbo
        settings.displacementL = choice.displacementL
        settings.tankCapacityL = choice.tankL
        if let year, year > 0 {
            settings.vehicleYear = year
        }
        let autoNames: Set<String> = ["", "BMW"]
        if autoNames.contains(settings.vehicleName) {
            settings.vehicleName = choice.defaultDisplayName
        }
    }

    private func choice(fromBrand brand: VehicleProfilePack.BrandEntry) -> VehicleProfileChoice {
        let arch = brand.archetype
        return VehicleProfileChoice(
            id: "brand.\(VehicleMakeAliases.slug(brand.make))",
            make: brand.make,
            model: Self.otherModel,
            engineLabel: arch.rawValue,
            yearFrom: nil,
            yearTo: nil,
            archetype: arch,
            pidPack: .universal,
            tankL: 50,
            displacementL: 1.6,
            fuel: arch.defaultFuel,
            isTurbo: arch.defaultIsTurbo
        )
    }

    private func genericChoice(make: String, archetype: VehicleArchetype) -> VehicleProfileChoice {
        let slug = VehicleMakeAliases.slug(make)
        let id = make.caseInsensitiveCompare(Self.universalMake) == .orderedSame
            ? "archetype.\(archetype.rawValue)"
            : "generic.\(slug).\(archetype.rawValue)"
        let defaults = VehicleArchetypeDefaults.profile(
            for: archetype, fuel: archetype.defaultFuel, isTurbo: archetype.defaultIsTurbo
        )
        return VehicleProfileChoice(
            id: id,
            make: make,
            model: Self.otherModel,
            engineLabel: archetype.rawValue,
            yearFrom: nil,
            yearTo: nil,
            archetype: archetype,
            pidPack: .universal,
            tankL: make.caseInsensitiveCompare(Self.universalMake) == .orderedSame ? 50 : 50,
            displacementL: defaults.displacementL,
            fuel: archetype.defaultFuel,
            isTurbo: archetype.defaultIsTurbo
        )
    }

    private func parseGenericId(_ id: String) -> VehicleProfileChoice? {
        let rest = String(id.dropFirst("generic.".count))
        guard let arch = VehicleArchetype.allCases.first(where: { rest.hasSuffix(".\($0.rawValue)") }) else {
            return nil
        }
        let slug = String(rest.dropLast(arch.rawValue.count + 1))
        let make = pack?.allMakes.first(where: { VehicleMakeAliases.slug($0) == slug }) ?? slug
        return genericChoice(make: make, archetype: arch)
    }

    private func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0.lowercased()).inserted }
    }
}

extension VehicleProfilePack {
    var allMakes: [String] {
        uniqueKeepOrder(models.map(\.make) + brands.map(\.make) + [VehicleProfileCatalog.universalMake])
    }

    private func uniqueKeepOrder(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0.lowercased()).inserted }
    }
}
