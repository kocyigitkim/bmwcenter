import Foundation

/// OBD-tabanlı arketip çıkarımı için gereken minimal sinyal seti (VIN yoksa).
struct OBDPowertrainHints: Sendable {
    var sawZeroRpmWhileMoving: Bool = false   // rpm→0 && speed>0 gözlemi (fullHybrid imzası)
    var boostOverBaroKpa: Double?              // MAP - baro tepe değeri (turbo imzası)
    var idleRpm: Double?
    var maxObservedRpm: Double?
    var hasFuelSystemStatusPID: Bool = true    // PID 0x03 yoksa dizel/EV ihtimali
    var hasRpmPID: Bool = true                 // PID 0x0C hiç yoksa EV ihtimali

    func inferArchetype() -> VehicleArchetype {
        if !hasRpmPID { return .ev }
        if sawZeroRpmWhileMoving { return .hybridFHEV }
        let isTurbo = (boostOverBaroKpa ?? 0) > 30
        let isDiesel = !hasFuelSystemStatusPID
            || ((idleRpm ?? 900) < 900 && (maxObservedRpm ?? 6000) < 5000)
        if isDiesel { return .dieselDPF }
        return isTurbo ? .gasolineTurboDI : .gasolineNA
    }
}

@MainActor
enum ProfileResolver {
    /// Çözümleme sırası: seçili profil id → VIN/motor kodu → model → marka → arketip.
    static func resolve(
        profileId: String? = nil,
        vin: String?,
        engineCode: String?,
        make: String?,
        model: String?,
        fuel: FuelType,
        isTurbo: Bool,
        obdHints: OBDPowertrainHints? = nil,
        pack: VehicleProfilePack? = .loadBundled()
    ) -> VehicleDiagnosticProfile {
        if let profileId, !profileId.isEmpty,
           let profile = resolveId(profileId, fuel: fuel, isTurbo: isTurbo, pack: pack) {
            return profile
        }

        let vinInfo = vin.flatMap(VINDecoder.decode)
        let resolvedMake = (make ?? vinInfo?.manufacturer).map { VehicleMakeAliases.canonical($0, in: pack) }

        if let pack {
            // 1. Model + motor kodu tam eşleşme.
            if let entry = matchModel(pack: pack, make: resolvedMake, model: model, engineCode: engineCode) {
                return .from(modelEntry: entry, fuel: fuel, isTurbo: isTurbo)
            }
            // 2. Marka katmanı.
            if let resolvedMake, let entry = matchBrand(pack: pack, make: resolvedMake) {
                return .from(brandEntry: entry, fuel: fuel, isTurbo: isTurbo)
            }
        }
        // 3. Arketip (OBD çıkarımı varsa onu kullan, yoksa yakıt/besleme'den türet).
        let archetype = obdHints?.inferArchetype() ?? fallbackArchetype(fuel: fuel, isTurbo: isTurbo)
        return VehicleArchetypeDefaults.profile(for: archetype, fuel: fuel, isTurbo: isTurbo)
    }

    static func resolveId(
        _ profileId: String,
        fuel: FuelType,
        isTurbo: Bool,
        pack: VehicleProfilePack?
    ) -> VehicleDiagnosticProfile? {
        if let entry = pack?.models.first(where: { $0.id == profileId }) {
            return .from(modelEntry: entry, fuel: fuel, isTurbo: isTurbo)
        }
        if profileId.hasPrefix("brand."),
           let brand = pack?.brands.first(where: { "brand.\(VehicleMakeAliases.slug($0.make))" == profileId }) {
            return .from(brandEntry: brand, fuel: fuel, isTurbo: isTurbo)
        }
        if profileId.hasPrefix("generic.") {
            let rest = String(profileId.dropFirst("generic.".count))
            if let arch = VehicleArchetype.allCases.first(where: { rest.hasSuffix(".\($0.rawValue)") }) {
                var p = VehicleArchetypeDefaults.profile(for: arch, fuel: fuel, isTurbo: isTurbo)
                let slug = String(rest.dropLast(arch.rawValue.count + 1))
                p.id = profileId
                p.make = pack?.allMakes.first(where: { VehicleMakeAliases.slug($0) == slug }) ?? slug
                p.model = VehicleProfileCatalog.otherModel
                p.pidPack = .universal
                return p
            }
        }
        if profileId.hasPrefix("archetype."),
           let arch = VehicleArchetype(rawValue: String(profileId.dropFirst("archetype.".count))) {
            return VehicleArchetypeDefaults.profile(for: arch, fuel: fuel, isTurbo: isTurbo)
        }
        return nil
    }

    private static func fallbackArchetype(fuel: FuelType, isTurbo: Bool) -> VehicleArchetype {
        switch fuel {
        case .diesel: return .dieselDPF
        case .lpg, .gasoline: return isTurbo ? .gasolineTurboDI : .gasolineNA
        }
    }

    private static func matchModel(
        pack: VehicleProfilePack,
        make: String?,
        model: String?,
        engineCode: String?
    ) -> VehicleProfilePack.ModelEntry? {
        guard let model = model?.lowercased(), !model.isEmpty else { return nil }
        var candidates = pack.models.filter { entry in
            entry.matchModel.contains { token in
                let t = token.lowercased()
                return !t.isEmpty && (model == t || model.contains(t))
            }
        }
        if let make {
            candidates = candidates.filter { $0.make.caseInsensitiveCompare(make) == .orderedSame }
        } else {
            candidates = candidates.filter {
                $0.make.caseInsensitiveCompare(VehicleProfileCatalog.universalMake) != .orderedSame
            }
        }
        guard !candidates.isEmpty else { return nil }
        if let engine = engineCode?.lowercased(), !engine.isEmpty {
            if let exact = candidates.first(where: { e in e.matchEngine.contains { engine.contains($0) } }) {
                return exact
            }
        }
        return candidates.first
    }

    private static func matchBrand(pack: VehicleProfilePack, make: String) -> VehicleProfilePack.BrandEntry? {
        pack.brands.first { $0.make.caseInsensitiveCompare(make) == .orderedSame }
    }
}
