import XCTest
import SwiftUI
@testable import QuickCar

final class AppSettingsTests: XCTestCase {
    func testIsolatedDefaultsRoundTripUnitsAndTheme() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.unitSystem, .metric)
        XCTAssertEqual(settings.themeMode, .system)
        XCTAssertEqual(settings.temperatureUnit, .celsius)
        XCTAssertEqual(settings.consumptionUnit, .l100km)
        XCTAssertEqual(settings.tankCapacityL, 50, accuracy: 0.01)

        settings.unitSystem = .imperial
        settings.themeMode = .dark
        settings.temperatureUnit = .fahrenheit
        settings.consumptionUnit = .mpgUS
        settings.pressureUnit = .bar

        let reloaded = AppSettings(defaults: defaults)
        XCTAssertEqual(reloaded.unitSystem, .imperial)
        XCTAssertEqual(reloaded.themeMode, .dark)
        XCTAssertEqual(reloaded.temperatureUnit, .fahrenheit)
        XCTAssertEqual(reloaded.consumptionUnit, .mpgUS)
        XCTAssertEqual(reloaded.pressureUnit, .bar)
    }

    func testTankCapacityCalibrationAndCareFlagsPersist() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        settings.tankCapacityL = 55
        settings.displacementL = 1.6
        settings.fuelCalibrationFactor = 1.12
        settings.speedCalibrationFactor = 0.97
        settings.vehiclePlatform = .universal
        settings.careOverheatWatchdog = false
        settings.careColdShield = false
        settings.careThermalShock = "off"

        let reloaded = AppSettings(defaults: defaults)
        XCTAssertEqual(reloaded.tankCapacityL, 55, accuracy: 0.01)
        XCTAssertEqual(reloaded.displacementL, 1.6, accuracy: 0.01)
        XCTAssertEqual(reloaded.fuelCalibrationFactor, 1.12, accuracy: 0.001)
        XCTAssertEqual(reloaded.speedCalibrationFactor, 0.97, accuracy: 0.001)
        XCTAssertEqual(reloaded.vehiclePlatform, .universal)
        XCTAssertEqual(reloaded.vehicleProfileId, VehicleProfileIDs.universalOBD2)
        XCTAssertFalse(reloaded.careOverheatWatchdog)
        XCTAssertFalse(reloaded.careColdShield)
        XCTAssertEqual(reloaded.careThermalShock, "off")
    }

    func testThemeModeColorScheme() {
        XCTAssertNil(ThemeMode.system.colorScheme)
        XCTAssertEqual(ThemeMode.light.colorScheme, .light)
        XCTAssertEqual(ThemeMode.dark.colorScheme, .dark)
        XCTAssertEqual(ThemeMode.allCases.count, 3)
    }

    func testMigratesLegacyUniversalPlatformToProfileId() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set("universal", forKey: "settings.vehiclePlatform")
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.vehiclePlatform, .universal)
        XCTAssertEqual(settings.vehicleProfileId, VehicleProfileIDs.universalOBD2)
    }

    func testMigratesLegacyBMWF30PlatformToProfileId() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set("bmwF30N13", forKey: "settings.vehiclePlatform")
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.vehiclePlatform, .bmwF30N13)
        XCTAssertEqual(settings.vehicleProfileId, VehicleProfileIDs.bmwF30N13)
        XCTAssertTrue(settings.vehiclePlatform.supportsExtendedPIDs)
    }

    func testMigratesLegacyBMWFSeriesPlatformToProfileId() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        defaults.set("bmwFSeries", forKey: "settings.vehiclePlatform")
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.vehiclePlatform, .bmwFSeries)
        XCTAssertEqual(settings.vehicleProfileId, VehicleProfileIDs.bmwFSeries)
    }

    func testFreshInstallDefaultsToUniversalProfile() {
        let defaults = UserDefaults(suiteName: UUID().uuidString)!
        let settings = AppSettings(defaults: defaults)
        XCTAssertEqual(settings.vehiclePlatform, .universal)
        XCTAssertEqual(settings.vehicleProfileId, VehicleProfileIDs.universalOBD2)
        XCTAssertEqual(settings.vehicleName, "")
        XCTAssertFalse(settings.isTurbo)
        XCTAssertFalse(settings.vehiclePlatform.supportsExtendedPIDs)
    }
}
