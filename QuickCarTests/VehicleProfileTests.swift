import XCTest
@testable import QuickCar

@MainActor
final class VehicleProfileTests: XCTestCase {
    func testBundledPackLoads() {
        let pack = VehicleProfilePack.loadBundled()
        XCTAssertNotNil(pack, "VehicleProfilePack.json must decode (confidence A/B/C included)")
        XCTAssertEqual(pack?.schemaVersion, 3)
        XCTAssertGreaterThanOrEqual(pack?.models.count ?? 0, 50)
        XCTAssertTrue(pack?.models.contains { $0.id == "universal.obd2" } ?? false)
        XCTAssertTrue(pack?.models.contains { $0.id == "bmw.f30.n13" } ?? false)
        XCTAssertTrue(pack?.models.contains { $0.id == "bmw.fseries" } ?? false)
        XCTAssertTrue(pack?.models.contains { $0.id == "bmw.320i.b48" } ?? false)
        XCTAssertTrue(pack?.brands.contains { $0.make == "BMW" } ?? false)
        let makes = Set(pack?.models.map(\.make) ?? [])
        for make in ["Toyota", "Volkswagen", "Mercedes-Benz", "Ford", "Honda", "Hyundai", "Kia", "Renault", "Fiat", "Audi", "Universal"] {
            XCTAssertTrue(makes.contains(make), "Missing make \(make)")
        }
        XCTAssertEqual(pack?.models.first { $0.id == "bmw.f30.n13" }?.pidPack, .bmwF30N13)
        XCTAssertEqual(pack?.models.first { $0.id == "toyota.corolla.2zrfxe" }?.pidPack, .universal)
    }

    func testResolvesBMW320iFromModelAndEngine() {
        let profile = ProfileResolver.resolve(
            vin: nil,
            engineCode: "B48",
            make: "BMW",
            model: "320i",
            fuel: .gasoline,
            isTurbo: true
        )
        XCTAssertEqual(profile.id, "bmw.320i.b48")
        XCTAssertEqual(profile.make, "BMW")
        XCTAssertEqual(profile.thermostatOpenC.value, 105, accuracy: 0.01)
        XCTAssertTrue(profile.mapControlledThermostat.value)
        XCTAssertEqual(profile.overallConfidence, .a)
        XCTAssertEqual(profile.thermostatOpenC.source, "service")
    }

    func testFallsBackToBrandWhenModelUnknown() {
        let profile = ProfileResolver.resolve(
            vin: nil,
            engineCode: nil,
            make: "BMW",
            model: "UnknownZed",
            fuel: .gasoline,
            isTurbo: true
        )
        XCTAssertEqual(profile.id, "brand.bmw")
        XCTAssertEqual(profile.make, "BMW")
        XCTAssertEqual(profile.thermostatOpenC.value, 100, accuracy: 0.01)
        XCTAssertEqual(profile.overallConfidence, .a)
    }

    func testFallsBackToArchetypeWithoutPack() {
        let na = ProfileResolver.resolve(
            vin: nil, engineCode: nil, make: nil, model: nil,
            fuel: .gasoline, isTurbo: false, pack: nil
        )
        XCTAssertEqual(na.archetype, .gasolineNA)
        XCTAssertEqual(na.overallConfidence, .c)

        let diesel = ProfileResolver.resolve(
            vin: nil, engineCode: nil, make: nil, model: nil,
            fuel: .diesel, isTurbo: true, pack: nil
        )
        XCTAssertEqual(diesel.archetype, .dieselDPF)
        XCTAssertTrue(diesel.hasDPF)
    }

    func testOBDHintsInferEVWithoutRPM() {
        var hints = OBDPowertrainHints()
        hints.hasRpmPID = false
        XCTAssertEqual(hints.inferArchetype(), .ev)
    }

    func testOBDHintsInferTurboGasoline() {
        var hints = OBDPowertrainHints()
        hints.boostOverBaroKpa = 80
        hints.idleRpm = 850
        hints.maxObservedRpm = 6500
        hints.hasFuelSystemStatusPID = true
        XCTAssertEqual(hints.inferArchetype(), .gasolineTurboDI)
    }

    func testOBDHintsInferHybridZeroRPMWhileMoving() {
        var hints = OBDPowertrainHints()
        hints.sawZeroRpmWhileMoving = true
        XCTAssertEqual(hints.inferArchetype(), .hybridFHEV)
    }

    func testCoolantThresholdsForTurboDI() {
        let p = VehicleArchetypeDefaults.profile(for: .gasolineTurboDI, fuel: .gasoline, isTurbo: true)
        XCTAssertEqual(p.thermostatOpenC.value, 90, accuracy: 0.01)
        XCTAssertEqual(p.coolantNormalTopC, 103, accuracy: 0.01)
        XCTAssertEqual(p.coolantWatchC, 106, accuracy: 0.01)
        XCTAssertGreaterThan(p.coolantAlarmC, p.coolantWatchC)
        XCTAssertGreaterThan(p.coolantCriticalC, p.coolantAlarmC)
        XCTAssertEqual(p.boilingCeilingC, 108 + 1.4 * 12, accuracy: 0.01)
        XCTAssertFalse(p.hasNoICE)
    }

    func testEVHasNoICEFlag() {
        let ev = VehicleArchetypeDefaults.profile(for: .ev, fuel: .gasoline, isTurbo: false)
        XCTAssertTrue(ev.hasNoICE)
        XCTAssertTrue(ev.isEV)
        XCTAssertEqual(ev.batteryChem, .lithium)
    }

    func testProfileStoreRefreshAppliesFuelAndModel() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        settings.fuelType = .diesel
        settings.isTurbo = true
        let store = VehicleProfileStore(settings: settings)
        store.refresh(engineCode: "B47", make: "BMW", model: "520d")
        XCTAssertEqual(store.profile.id, "bmw.520d.b47")
        XCTAssertEqual(store.profile.archetype, .dieselDPF)
    }

    func testConfidenceOrdering() {
        XCTAssertTrue(Confidence.c < Confidence.b)
        XCTAssertTrue(Confidence.b < Confidence.a)
    }

    func testResolvesProfileIdUniversalAndBMW() {
        let universal = ProfileResolver.resolve(
            profileId: VehicleProfileIDs.universalOBD2,
            vin: nil, engineCode: nil, make: nil, model: nil,
            fuel: .gasoline, isTurbo: false
        )
        XCTAssertEqual(universal.id, VehicleProfileIDs.universalOBD2)
        XCTAssertEqual(universal.make, VehicleProfileCatalog.universalMake)
        XCTAssertEqual(universal.pidPack, .universal)
        XCTAssertTrue(VLinkerPIDCatalog.extendedPIDs(for: universal.pidPack).isEmpty)

        let f30 = ProfileResolver.resolve(
            profileId: VehicleProfileIDs.bmwF30N13,
            vin: nil, engineCode: nil, make: nil, model: nil,
            fuel: .gasoline, isTurbo: true
        )
        XCTAssertEqual(f30.id, VehicleProfileIDs.bmwF30N13)
        XCTAssertEqual(f30.pidPack, .bmwF30N13)
        XCTAssertFalse(VLinkerPIDCatalog.extendedPIDs(for: f30.pidPack).isEmpty)

        let fSeries = ProfileResolver.resolve(
            profileId: VehicleProfileIDs.bmwFSeries,
            vin: nil, engineCode: nil, make: nil, model: nil,
            fuel: .gasoline, isTurbo: true
        )
        XCTAssertEqual(fSeries.pidPack, .bmwFSeries)
        XCTAssertFalse(VLinkerPIDCatalog.extendedPIDs(for: fSeries.pidPack).isEmpty)
    }

    func testSelectingProfileFillsSettingsAndPIDPack() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        let catalog = VehicleProfileCatalog()
        guard let toyota = catalog.choice(id: "toyota.corolla.2zrfxe") else {
            return XCTFail("Toyota hybrid profile missing")
        }
        catalog.apply(toyota, to: settings)
        XCTAssertEqual(settings.vehicleProfileId, "toyota.corolla.2zrfxe")
        XCTAssertEqual(settings.vehiclePlatform, .universal)
        XCTAssertEqual(settings.fuelType, .gasoline)
        XCTAssertFalse(settings.isTurbo)
        XCTAssertEqual(settings.displacementL, 1.8, accuracy: 0.01)
        XCTAssertEqual(settings.tankCapacityL, 43, accuracy: 0.01)
        XCTAssertTrue(VLinkerPIDCatalog.extendedPIDs(for: settings.vehiclePlatform).isEmpty)

        guard let bmw = catalog.choice(id: VehicleProfileIDs.bmwF30N13) else {
            return XCTFail("BMW F30 profile missing")
        }
        catalog.apply(bmw, to: settings)
        XCTAssertEqual(settings.vehiclePlatform, .bmwF30N13)
        XCTAssertTrue(settings.isTurbo)
        XCTAssertEqual(settings.displacementL, 1.6, accuracy: 0.01)
        XCTAssertFalse(VLinkerPIDCatalog.extendedPIDs(for: settings.vehiclePlatform).isEmpty)
    }

    func testResolverMatchesToyotaVINToBrand() {
        let vin = assembleVIN(wmiVds: "JT2BF28K", year: "G", plantSerial: "F123456")
        let info = VINDecoder.decode(vin)
        XCTAssertEqual(info?.manufacturer, "Toyota")
        let profile = ProfileResolver.resolve(
            vin: vin, engineCode: nil, make: nil, model: nil,
            fuel: .gasoline, isTurbo: false
        )
        XCTAssertEqual(profile.make, "Toyota")
        XCTAssertEqual(profile.pidPack, .universal)
    }

    func testCatalogListsUniversalFirstAndOtherForMakes() {
        let catalog = VehicleProfileCatalog()
        XCTAssertEqual(catalog.makes.first, VehicleProfileCatalog.universalMake)
        XCTAssertTrue(catalog.makes.contains("Toyota"))
        XCTAssertTrue(catalog.makes.contains("Volkswagen"))
        XCTAssertTrue(catalog.models(for: "Toyota").contains("Corolla"))
        XCTAssertTrue(catalog.models(for: "Toyota").contains(VehicleProfileCatalog.otherModel))
        XCTAssertFalse(catalog.models(for: VehicleProfileCatalog.universalMake).contains(VehicleProfileCatalog.otherModel))
        XCTAssertNotNil(catalog.choice(id: "generic.honda.hybridFHEV"))
        XCTAssertEqual(catalog.choice(id: "generic.honda.hybridFHEV")?.pidPack, .universal)
    }

    func testMigrationMapsOldPlatformEnum() {
        XCTAssertEqual(VehicleProfileMigration.profileId(from: .universal), VehicleProfileIDs.universalOBD2)
        XCTAssertEqual(VehicleProfileMigration.profileId(from: .bmwF30N13), VehicleProfileIDs.bmwF30N13)
        XCTAssertEqual(VehicleProfileMigration.profileId(from: .bmwFSeries), VehicleProfileIDs.bmwFSeries)
        XCTAssertEqual(
            VehicleProfileMigration.platform(forProfileId: VehicleProfileIDs.bmwF30N13),
            .bmwF30N13
        )
        XCTAssertEqual(
            VehicleProfileMigration.platform(forProfileId: VehicleProfileIDs.universalOBD2),
            .universal
        )
    }

    private func assembleVIN(wmiVds: String, year: Character, plantSerial: String) -> String {
        precondition(wmiVds.count == 8)
        precondition(plantSerial.count == 7)
        let partial = Array(wmiVds + "0" + String(year) + plantSerial)
        let weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
        let map: [Character: Int] = [
            "A": 1, "B": 2, "C": 3, "D": 4, "E": 5, "F": 6, "G": 7, "H": 8,
            "J": 1, "K": 2, "L": 3, "M": 4, "N": 5, "P": 7, "R": 9,
            "S": 2, "T": 3, "U": 4, "V": 5, "W": 6, "X": 7, "Y": 8, "Z": 9,
            "0": 0, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9
        ]
        var sum = 0
        for i in 0..<17 {
            sum += (map[partial[i]] ?? 0) * weights[i]
        }
        let rem = sum % 11
        let check: Character = rem == 10 ? "X" : Character(String(rem))
        var chars = partial
        chars[8] = check
        return String(chars)
    }
}
