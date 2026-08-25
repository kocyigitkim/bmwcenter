import Foundation

/// Uygulama genelinde tekil çözülmüş `VehicleDiagnosticProfile` kaynağı — Care modülleri ve
/// DTCMonitor bunu okur. Seçili katalog id (veya VIN/marka) üzerinden çözülür; yakıt/turbo
/// ayarları kullanıcı override’ı olarak bindirilir.
@MainActor
final class VehicleProfileStore: ObservableObject {
    @Published private(set) var profile: VehicleDiagnosticProfile

    private let settings: AppSettings
    private let pack: VehicleProfilePack?

    init(settings: AppSettings) {
        self.settings = settings
        self.pack = .loadBundled()
        self.profile = Self.resolve(settings: settings, pack: pack)
    }

    func applyFromSettings() {
        profile = Self.resolve(settings: settings, pack: pack)
    }

    func refresh(vin: String? = nil, engineCode: String? = nil, make: String? = nil, model: String? = nil) {
        profile = ProfileResolver.resolve(
            vin: vin, engineCode: engineCode, make: make, model: model,
            fuel: settings.fuelType, isTurbo: settings.isTurbo, pack: pack
        )
    }

    private static func resolve(settings: AppSettings, pack: VehicleProfilePack?) -> VehicleDiagnosticProfile {
        var resolved = ProfileResolver.resolve(
            profileId: settings.vehicleProfileId,
            vin: settings.lastVIN.isEmpty ? nil : settings.lastVIN,
            engineCode: nil,
            make: nil,
            model: nil,
            fuel: settings.fuelType,
            isTurbo: settings.isTurbo,
            pack: pack
        )
        if settings.vehicleYear > 0 {
            resolved.modelYear = settings.vehicleYear
        }
        return resolved
    }
}
