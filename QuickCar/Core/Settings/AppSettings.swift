import Foundation
import Observation

@Observable
final class AppSettings {
    private enum Keys {
        static let unitSystem = "settings.unitSystem"
        static let consumptionUnit = "settings.consumptionUnit"
        static let temperatureUnit = "settings.temperatureUnit"
        static let languageCode = "settings.languageCode"
        static let autoRecordTrips = "settings.autoRecordTrips"
        static let startThresholdKmh = "settings.startThresholdKmh"
        static let stopDelayS = "settings.stopDelayS"
        static let pricePerLiter = "settings.pricePerLiter"
        static let currencyCode = "settings.currencyCode"
        static let useMockAdapter = "settings.useMockAdapter"
        static let autoConnectOnLaunch = "settings.autoConnectOnLaunch"
        static let lastAdapterID = "settings.lastAdapterID"
        static let vehicleName = "settings.vehicleName"
        static let fuelType = "settings.fuelType"
        static let tankCapacityL = "settings.tankCapacityL"
        static let displacementL = "settings.displacementL"
        static let volumetricEfficiency = "settings.volumetricEfficiency"
        static let isTurbo = "settings.isTurbo"
        static let vehiclePlatform = "settings.vehiclePlatform"
        static let vehicleProfileId = "settings.vehicleProfileId"
        static let lastVIN = "settings.lastVIN"
        static let vehicleYear = "settings.vehicleYear"
        static let fuelCalibrationFactor = "settings.fuelCalibrationFactor"
        static let speedCalibrationFactor = "settings.speedCalibrationFactor"
        static let applySpeedCorrection = "settings.applySpeedCorrection"
        static let spokenAlerts = "settings.spokenAlerts"
        static let enableAlerts = "settings.enableAlerts"
        static let backgroundDTCMonitor = "settings.backgroundDTCMonitor"
        static let useMotionSensors = "settings.useMotionSensors"
        static let scoreSensitivity = "settings.scoreSensitivity"
        static let pressureUnit = "settings.pressureUnit"
        static let defaultTripCategory = "settings.defaultTripCategory"
        static let saveRoute = "settings.saveRoute"
        static let lastParkingLatitude = "settings.lastParkingLatitude"
        static let lastParkingLongitude = "settings.lastParkingLongitude"
        static let lastParkingPlaceName = "settings.lastParkingPlaceName"
        static let iCloudSync = "settings.iCloudSync"
        // Care §15
        static let careOverheatWatchdog = "care.overheatWatchdog"
        static let careColdShield = "care.coldShield"
        static let careThermalShock = "care.thermalShock"
        static let careBatteryGuardian = "care.batteryGuardian"
        static let careSensitivity = "care.sensitivity"
        static let careEcoCoach = "care.ecoCoach"
        static let careSpokenCues = "care.spokenCues"
        static let careCueFrequency = "care.cueFrequency"
        static let careGearCoach = "care.gearCoach"
        static let carePositiveTones = "care.positiveTones"
        static let careWeeklyChallenges = "care.weeklyChallenges"
        static let careBadgesStreak = "care.badgesStreak"
        static let careTripSummaryCard = "care.tripSummaryCard"
        static let careHideLocationSharing = "care.hideLocationSharing"
        static let careFuelTrimMonitor = "care.fuelTrimMonitor"
        static let careThermostatWatch = "care.thermostatWatch"
        static let careAirflowWatch = "care.airflowWatch"
        static let careAdaptiveIntervals = "care.adaptiveIntervals"
        static let careShowSeverityFactor = "care.showSeverityFactor"
        static let themeMode = "settings.themeMode"
        static let dashboardLayoutJSON = "settings.dashboardLayoutJSON"
    }

    private let defaults: UserDefaults

    var unitSystem: UnitSystem {
        didSet { defaults.set(unitSystem.rawValue, forKey: Keys.unitSystem) }
    }
    var themeMode: ThemeMode {
        didSet { defaults.set(themeMode.rawValue, forKey: Keys.themeMode) }
    }
    var consumptionUnit: ConsumptionUnit {
        didSet { defaults.set(consumptionUnit.rawValue, forKey: Keys.consumptionUnit) }
    }
    var temperatureUnit: TemperatureUnit {
        didSet { defaults.set(temperatureUnit.rawValue, forKey: Keys.temperatureUnit) }
    }
    var languageCode: String {
        didSet {
            defaults.set(languageCode, forKey: Keys.languageCode)
            Self.applyLanguage(languageCode)
        }
    }
    var autoRecordTrips: Bool {
        didSet { defaults.set(autoRecordTrips, forKey: Keys.autoRecordTrips) }
    }
    var startThresholdKmh: Double {
        didSet { defaults.set(startThresholdKmh, forKey: Keys.startThresholdKmh) }
    }
    var stopDelayS: Double {
        didSet { defaults.set(stopDelayS, forKey: Keys.stopDelayS) }
    }
    var pricePerLiter: Double {
        didSet { defaults.set(pricePerLiter, forKey: Keys.pricePerLiter) }
    }
    var currencyCode: String {
        didSet { defaults.set(currencyCode, forKey: Keys.currencyCode) }
    }
    var useMockAdapter: Bool {
        didSet { defaults.set(useMockAdapter, forKey: Keys.useMockAdapter) }
    }
    var autoConnectOnLaunch: Bool {
        didSet { defaults.set(autoConnectOnLaunch, forKey: Keys.autoConnectOnLaunch) }
    }
    var lastAdapterID: UUID? {
        didSet { defaults.set(lastAdapterID?.uuidString, forKey: Keys.lastAdapterID) }
    }
    var vehicleName: String {
        didSet { defaults.set(vehicleName, forKey: Keys.vehicleName) }
    }
    var fuelType: FuelType {
        didSet { defaults.set(fuelType.rawValue, forKey: Keys.fuelType) }
    }
    var tankCapacityL: Double {
        didSet { defaults.set(tankCapacityL, forKey: Keys.tankCapacityL) }
    }
    var displacementL: Double {
        didSet { defaults.set(displacementL, forKey: Keys.displacementL) }
    }
    var volumetricEfficiency: Double {
        didSet { defaults.set(volumetricEfficiency, forKey: Keys.volumetricEfficiency) }
    }
    var isTurbo: Bool {
        didSet { defaults.set(isTurbo, forKey: Keys.isTurbo) }
    }
    /// Unlocks VLinker Mode-22 PIDs (F30/N13 oil temp/pressure, etc.).
    /// Kept in sync with the selected `vehicleProfileId` (BMW packs only).
    var vehiclePlatform: VehiclePlatform {
        didSet { defaults.set(vehiclePlatform.rawValue, forKey: Keys.vehiclePlatform) }
    }
    /// Catalog id (`universal.obd2`, `bmw.f30.n13`, `toyota.corolla.2zrfxe`, …).
    var vehicleProfileId: String {
        didSet { defaults.set(vehicleProfileId, forKey: Keys.vehicleProfileId) }
    }
    var lastVIN: String {
        didSet { defaults.set(lastVIN, forKey: Keys.lastVIN) }
    }
    /// 0 = not set.
    var vehicleYear: Int {
        didSet { defaults.set(vehicleYear, forKey: Keys.vehicleYear) }
    }
    var fuelCalibrationFactor: Double {
        didSet { defaults.set(fuelCalibrationFactor, forKey: Keys.fuelCalibrationFactor) }
    }
    var speedCalibrationFactor: Double {
        didSet { defaults.set(speedCalibrationFactor, forKey: Keys.speedCalibrationFactor) }
    }
    var applySpeedCorrection: Bool {
        didSet { defaults.set(applySpeedCorrection, forKey: Keys.applySpeedCorrection) }
    }
    var spokenAlerts: Bool {
        didSet { defaults.set(spokenAlerts, forKey: Keys.spokenAlerts) }
    }
    var enableAlerts: Bool {
        didSet { defaults.set(enableAlerts, forKey: Keys.enableAlerts) }
    }
    var backgroundDTCMonitor: Bool {
        didSet { defaults.set(backgroundDTCMonitor, forKey: Keys.backgroundDTCMonitor) }
    }
    var useMotionSensors: Bool {
        didSet { defaults.set(useMotionSensors, forKey: Keys.useMotionSensors) }
    }
    var scoreSensitivity: String {
        didSet { defaults.set(scoreSensitivity, forKey: Keys.scoreSensitivity) }
    }
    var pressureUnit: PressureUnit {
        didSet { defaults.set(pressureUnit.rawValue, forKey: Keys.pressureUnit) }
    }
    var defaultTripCategory: String {
        didSet { defaults.set(defaultTripCategory, forKey: Keys.defaultTripCategory) }
    }
    var saveRoute: Bool {
        didSet { defaults.set(saveRoute, forKey: Keys.saveRoute) }
    }
    var lastParkingLatitude: Double? {
        didSet {
            if let lastParkingLatitude { defaults.set(lastParkingLatitude, forKey: Keys.lastParkingLatitude) }
            else { defaults.removeObject(forKey: Keys.lastParkingLatitude) }
        }
    }
    var lastParkingLongitude: Double? {
        didSet {
            if let lastParkingLongitude { defaults.set(lastParkingLongitude, forKey: Keys.lastParkingLongitude) }
            else { defaults.removeObject(forKey: Keys.lastParkingLongitude) }
        }
    }
    var lastParkingPlaceName: String? {
        didSet { defaults.set(lastParkingPlaceName, forKey: Keys.lastParkingPlaceName) }
    }
    var iCloudSync: Bool {
        didSet { defaults.set(iCloudSync, forKey: Keys.iCloudSync) }
    }

    // MARK: Care §15
    var careOverheatWatchdog: Bool {
        didSet { defaults.set(careOverheatWatchdog, forKey: Keys.careOverheatWatchdog) }
    }
    var careColdShield: Bool {
        didSet { defaults.set(careColdShield, forKey: Keys.careColdShield) }
    }
    /// auto | always | off
    var careThermalShock: String {
        didSet { defaults.set(careThermalShock, forKey: Keys.careThermalShock) }
    }
    var careBatteryGuardian: Bool {
        didSet { defaults.set(careBatteryGuardian, forKey: Keys.careBatteryGuardian) }
    }
    /// early | balanced | calm
    var careSensitivity: String {
        didSet { defaults.set(careSensitivity, forKey: Keys.careSensitivity) }
    }
    var careEcoCoach: Bool {
        didSet { defaults.set(careEcoCoach, forKey: Keys.careEcoCoach) }
    }
    var careSpokenCues: Bool {
        didSet { defaults.set(careSpokenCues, forKey: Keys.careSpokenCues) }
    }
    /// low | normal | high
    var careCueFrequency: String {
        didSet { defaults.set(careCueFrequency, forKey: Keys.careCueFrequency) }
    }
    var careGearCoach: Bool {
        didSet { defaults.set(careGearCoach, forKey: Keys.careGearCoach) }
    }
    var carePositiveTones: Bool {
        didSet { defaults.set(carePositiveTones, forKey: Keys.carePositiveTones) }
    }
    var careWeeklyChallenges: Bool {
        didSet { defaults.set(careWeeklyChallenges, forKey: Keys.careWeeklyChallenges) }
    }
    var careBadgesStreak: Bool {
        didSet { defaults.set(careBadgesStreak, forKey: Keys.careBadgesStreak) }
    }
    var careTripSummaryCard: Bool {
        didSet { defaults.set(careTripSummaryCard, forKey: Keys.careTripSummaryCard) }
    }
    var careHideLocationSharing: Bool {
        didSet { defaults.set(careHideLocationSharing, forKey: Keys.careHideLocationSharing) }
    }
    var careFuelTrimMonitor: Bool {
        didSet { defaults.set(careFuelTrimMonitor, forKey: Keys.careFuelTrimMonitor) }
    }
    var careThermostatWatch: Bool {
        didSet { defaults.set(careThermostatWatch, forKey: Keys.careThermostatWatch) }
    }
    var careAirflowWatch: Bool {
        didSet { defaults.set(careAirflowWatch, forKey: Keys.careAirflowWatch) }
    }
    var careAdaptiveIntervals: Bool {
        didSet { defaults.set(careAdaptiveIntervals, forKey: Keys.careAdaptiveIntervals) }
    }
    var careShowSeverityFactor: Bool {
        didSet { defaults.set(careShowSeverityFactor, forKey: Keys.careShowSeverityFactor) }
    }

    /// Persisted dashboard widget layout (JSON). Nil means Daily factory.
    var dashboardLayoutJSON: String? {
        didSet { defaults.set(dashboardLayoutJSON, forKey: Keys.dashboardLayoutJSON) }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults

        unitSystem = UnitSystem(rawValue: defaults.string(forKey: Keys.unitSystem) ?? "") ?? .metric
        themeMode = ThemeMode(rawValue: defaults.string(forKey: Keys.themeMode) ?? "") ?? .system
        consumptionUnit = ConsumptionUnit(rawValue: defaults.string(forKey: Keys.consumptionUnit) ?? "") ?? .l100km
        temperatureUnit = TemperatureUnit(rawValue: defaults.string(forKey: Keys.temperatureUnit) ?? "") ?? .celsius
        languageCode = defaults.string(forKey: Keys.languageCode)
            ?? Locale.current.language.languageCode?.identifier
            ?? "en"
        autoRecordTrips = defaults.object(forKey: Keys.autoRecordTrips) as? Bool ?? true
        startThresholdKmh = defaults.object(forKey: Keys.startThresholdKmh) as? Double ?? 5
        stopDelayS = defaults.object(forKey: Keys.stopDelayS) as? Double ?? 120
        pricePerLiter = defaults.object(forKey: Keys.pricePerLiter) as? Double ?? 44.50
        currencyCode = defaults.string(forKey: Keys.currencyCode) ?? "TRY"
        autoConnectOnLaunch = defaults.object(forKey: Keys.autoConnectOnLaunch) as? Bool ?? true
        if let id = defaults.string(forKey: Keys.lastAdapterID) {
            lastAdapterID = UUID(uuidString: id)
        } else {
            lastAdapterID = nil
        }
        vehicleName = defaults.string(forKey: Keys.vehicleName) ?? ""
        fuelType = FuelType(rawValue: defaults.string(forKey: Keys.fuelType) ?? "") ?? .gasoline
        volumetricEfficiency = defaults.object(forKey: Keys.volumetricEfficiency) as? Double ?? 0.85
        lastVIN = defaults.string(forKey: Keys.lastVIN) ?? ""
        let storedPlatformRaw = defaults.string(forKey: Keys.vehiclePlatform)
        let storedProfileId = defaults.string(forKey: Keys.vehicleProfileId)
        let storedPlatform = storedPlatformRaw.flatMap(VehiclePlatform.init(rawValue:))
        if let storedProfileId, !storedProfileId.isEmpty {
            vehicleProfileId = storedProfileId
            vehiclePlatform = storedPlatform
                ?? VehicleProfileMigration.platform(forProfileId: storedProfileId)
        } else if let storedPlatform {
            let migratedId = VehicleProfileMigration.profileId(from: storedPlatform)
            vehiclePlatform = storedPlatform
            vehicleProfileId = migratedId
            defaults.set(migratedId, forKey: Keys.vehicleProfileId)
        } else {
            vehiclePlatform = .universal
            vehicleProfileId = VehicleProfileIDs.universalOBD2
        }

        let bmwLegacy = (storedProfileId == nil || storedProfileId?.isEmpty == true)
            && (storedPlatform == .bmwF30N13 || storedPlatform == .bmwFSeries)
        tankCapacityL = defaults.object(forKey: Keys.tankCapacityL) as? Double ?? (bmwLegacy ? 60.0 : 50.0)
        displacementL = defaults.object(forKey: Keys.displacementL) as? Double ?? (bmwLegacy ? 2.0 : 1.6)
        if defaults.object(forKey: Keys.isTurbo) != nil {
            isTurbo = defaults.bool(forKey: Keys.isTurbo)
        } else {
            isTurbo = bmwLegacy
        }
        if defaults.object(forKey: Keys.vehicleYear) != nil {
            vehicleYear = defaults.integer(forKey: Keys.vehicleYear)
        } else {
            vehicleYear = 0
        }
        fuelCalibrationFactor = defaults.object(forKey: Keys.fuelCalibrationFactor) as? Double ?? 1.0
        speedCalibrationFactor = defaults.object(forKey: Keys.speedCalibrationFactor) as? Double ?? 1.0
        applySpeedCorrection = defaults.object(forKey: Keys.applySpeedCorrection) as? Bool ?? false
        spokenAlerts = defaults.object(forKey: Keys.spokenAlerts) as? Bool ?? true
        enableAlerts = defaults.object(forKey: Keys.enableAlerts) as? Bool ?? true
        backgroundDTCMonitor = defaults.object(forKey: Keys.backgroundDTCMonitor) as? Bool ?? true
        useMotionSensors = defaults.object(forKey: Keys.useMotionSensors) as? Bool ?? true
        scoreSensitivity = defaults.string(forKey: Keys.scoreSensitivity) ?? "normal"
        pressureUnit = PressureUnit(rawValue: defaults.string(forKey: Keys.pressureUnit) ?? "") ?? .kpa
        defaultTripCategory = defaults.string(forKey: Keys.defaultTripCategory) ?? TripCategory.personal.rawValue
        saveRoute = defaults.object(forKey: Keys.saveRoute) as? Bool ?? true
        if defaults.object(forKey: Keys.lastParkingLatitude) != nil {
            lastParkingLatitude = defaults.double(forKey: Keys.lastParkingLatitude)
            lastParkingLongitude = defaults.double(forKey: Keys.lastParkingLongitude)
        } else {
            lastParkingLatitude = nil
            lastParkingLongitude = nil
        }
        lastParkingPlaceName = defaults.string(forKey: Keys.lastParkingPlaceName)
        iCloudSync = defaults.object(forKey: Keys.iCloudSync) as? Bool ?? false

        careOverheatWatchdog = defaults.object(forKey: Keys.careOverheatWatchdog) as? Bool ?? true
        careColdShield = defaults.object(forKey: Keys.careColdShield) as? Bool ?? true
        careThermalShock = defaults.string(forKey: Keys.careThermalShock) ?? "auto"
        careBatteryGuardian = defaults.object(forKey: Keys.careBatteryGuardian) as? Bool ?? true
        careSensitivity = defaults.string(forKey: Keys.careSensitivity) ?? "balanced"
        careEcoCoach = defaults.object(forKey: Keys.careEcoCoach) as? Bool ?? true
        careSpokenCues = defaults.object(forKey: Keys.careSpokenCues) as? Bool ?? true
        careCueFrequency = defaults.string(forKey: Keys.careCueFrequency) ?? "normal"
        careGearCoach = defaults.object(forKey: Keys.careGearCoach) as? Bool ?? true
        carePositiveTones = defaults.object(forKey: Keys.carePositiveTones) as? Bool ?? true
        careWeeklyChallenges = defaults.object(forKey: Keys.careWeeklyChallenges) as? Bool ?? true
        careBadgesStreak = defaults.object(forKey: Keys.careBadgesStreak) as? Bool ?? true
        careTripSummaryCard = defaults.object(forKey: Keys.careTripSummaryCard) as? Bool ?? true
        careHideLocationSharing = defaults.object(forKey: Keys.careHideLocationSharing) as? Bool ?? true
        careFuelTrimMonitor = defaults.object(forKey: Keys.careFuelTrimMonitor) as? Bool ?? true
        careThermostatWatch = defaults.object(forKey: Keys.careThermostatWatch) as? Bool ?? true
        careAirflowWatch = defaults.object(forKey: Keys.careAirflowWatch) as? Bool ?? true
        careAdaptiveIntervals = defaults.object(forKey: Keys.careAdaptiveIntervals) as? Bool ?? true
        careShowSeverityFactor = defaults.object(forKey: Keys.careShowSeverityFactor) as? Bool ?? true
        dashboardLayoutJSON = defaults.string(forKey: Keys.dashboardLayoutJSON)

        #if targetEnvironment(simulator)
        useMockAdapter = defaults.object(forKey: Keys.useMockAdapter) as? Bool ?? true
        #else
        // Physical device: prefer real BLE OBD unless user already chose mock.
        useMockAdapter = defaults.object(forKey: Keys.useMockAdapter) as? Bool ?? false
        #endif

        Self.applyLanguage(languageCode)
    }

    /// Drives Bundle / String(localized:) lookup for in-app language picker.
    static func applyLanguage(_ code: String) {
        UserDefaults.standard.set([code], forKey: "AppleLanguages")
        UserDefaults.standard.set(code, forKey: "AppleLocale")
    }
}
