import { createMMKV } from "react-native-mmkv";
import { create } from "zustand";
import * as Localization from "expo-localization";

export const storage = createMMKV({ id: "quickcar-settings" });

export type UnitSystem = "metric" | "imperial";
export type ConsumptionUnit = "l100km" | "kmPerL" | "mpgUS" | "mpgUK";
export type TemperatureUnit = "celsius" | "fahrenheit";
export type PressureUnit = "kpa" | "bar" | "psi";
export type ThemeMode = "system" | "light" | "dark";
export type FuelType = "gasoline" | "diesel" | "lpg";
export type TripCategory = "personal" | "business" | "other";
export type VehiclePlatform = "universal" | "bmwF30N13" | "bmwFSeries";

export interface AppSettingsState {
  unitSystem: UnitSystem;
  themeMode: ThemeMode;
  consumptionUnit: ConsumptionUnit;
  temperatureUnit: TemperatureUnit;
  languageCode: string;
  autoRecordTrips: boolean;
  startThresholdKmh: number;
  stopDelayS: number;
  pricePerLiter: number;
  currencyCode: string;
  useMockAdapter: boolean;
  autoConnectOnLaunch: boolean;
  lastAdapterId: string | null;
  lastAdapterName: string | null;
  autoReconnect: boolean;
  vehicleName: string;
  fuelType: FuelType;
  tankCapacityL: number;
  displacementL: number;
  volumetricEfficiency: number;
  isTurbo: boolean;
  vehiclePlatform: VehiclePlatform;
  vehicleProfileId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleEngineCode: string;
  lastVIN: string;
  vehicleYear: number;
  fuelCalibrationFactor: number;
  speedCalibrationFactor: number;
  applySpeedCorrection: boolean;
  spokenAlerts: boolean;
  enableAlerts: boolean;
  backgroundDTCMonitor: boolean;
  useMotionSensors: boolean;
  scoreSensitivity: "early" | "normal" | "calm";
  pressureUnit: PressureUnit;
  defaultTripCategory: TripCategory;
  saveRoute: boolean;
  lastParkingLatitude: number | null;
  lastParkingLongitude: number | null;
  lastParkingPlaceName: string | null;
  cloudSync: boolean;
  calibrationPromptDismissed: boolean;

  careOverheatWatchdog: boolean;
  careColdShield: boolean;
  careThermalShock: "auto" | "always" | "off";
  careBatteryGuardian: boolean;
  careSensitivity: "early" | "balanced" | "calm";
  careEcoCoach: boolean;
  careSpokenCues: boolean;
  careCueFrequency: "low" | "normal" | "high";
  careGearCoach: boolean;
  carePositiveTones: boolean;
  careWeeklyChallenges: boolean;
  careBadgesStreak: boolean;
  careTripSummaryCard: boolean;
  careHideLocationSharing: boolean;
  careFuelTrimMonitor: boolean;
  careThermostatWatch: boolean;
  careAirflowWatch: boolean;
  careAdaptiveIntervals: boolean;
  careShowSeverityFactor: boolean;


  set: <K extends keyof AppSettingsState>(key: K, value: AppSettingsState[K]) => void;
}

const defaults = {
  unitSystem: "metric" as UnitSystem,
  themeMode: "system" as ThemeMode,
  consumptionUnit: "l100km" as ConsumptionUnit,
  temperatureUnit: "celsius" as TemperatureUnit,
  languageCode: Localization.getLocales()[0]?.languageCode ?? "en",
  autoRecordTrips: true,
  startThresholdKmh: 5,
  stopDelayS: 120,
  pricePerLiter: 44.5,
  currencyCode: "TRY",
  useMockAdapter: true,
  autoConnectOnLaunch: true,
  lastAdapterId: null as string | null,
  lastAdapterName: null as string | null,
  autoReconnect: true,
  vehicleName: "",
  fuelType: "gasoline" as FuelType,
  tankCapacityL: 60,
  displacementL: 2.0,
  volumetricEfficiency: 0.85,
  isTurbo: true,
  vehiclePlatform: "universal" as VehiclePlatform,
  vehicleProfileId: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleEngineCode: "",
  lastVIN: "",
  vehicleYear: 0,
  fuelCalibrationFactor: 1.0,
  speedCalibrationFactor: 1.0,
  applySpeedCorrection: false,
  spokenAlerts: true,
  enableAlerts: true,
  backgroundDTCMonitor: true,
  useMotionSensors: true,
  scoreSensitivity: "normal" as const,
  pressureUnit: "kpa" as PressureUnit,
  defaultTripCategory: "personal" as TripCategory,
  saveRoute: true,
  lastParkingLatitude: null as number | null,
  lastParkingLongitude: null as number | null,
  lastParkingPlaceName: null as string | null,
  cloudSync: false,
  calibrationPromptDismissed: false,

  careOverheatWatchdog: true,
  careColdShield: true,
  careThermalShock: "auto" as const,
  careBatteryGuardian: true,
  careSensitivity: "balanced" as const,
  careEcoCoach: true,
  careSpokenCues: true,
  careCueFrequency: "normal" as const,
  careGearCoach: true,
  carePositiveTones: true,
  careWeeklyChallenges: true,
  careBadgesStreak: true,
  careTripSummaryCard: true,
  careHideLocationSharing: true,
  careFuelTrimMonitor: true,
  careThermostatWatch: true,
  careAirflowWatch: true,
  careAdaptiveIntervals: true,
  careShowSeverityFactor: true,

};

function load<K extends keyof typeof defaults>(key: K): (typeof defaults)[K] {
  const raw = storage.getString(`settings.${key}`);
  if (raw == null) return defaults[key];
  try {
    return JSON.parse(raw) as (typeof defaults)[K];
  } catch {
    return defaults[key];
  }
}

export const useAppSettings = create<AppSettingsState>((set) => {
  const initial = Object.fromEntries(
    (Object.keys(defaults) as Array<keyof typeof defaults>).map((k) => [k, load(k)])
  ) as typeof defaults;

  return {
    ...initial,
    set: (key, value) => {
      storage.set(`settings.${String(key)}`, JSON.stringify(value));
      set({ [key]: value } as Partial<AppSettingsState>);
    },
  };
});
