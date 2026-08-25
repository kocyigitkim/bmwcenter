import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import { boostKpa, isEngineRunning } from "../obd/vehicleSnapshot";
import type { AlertSeverity } from "./alertTypes";

export interface VehicleProfileSnapshot {
  tankCapacityL: number;
}

export interface AlertRule {
  id: string;
  titleKey: string;
  bodyKey: string;
  severity: AlertSeverity;
  cooldownS: number;
  evaluate: (snap: VehicleSnapshot, profile: VehicleProfileSnapshot) => boolean;
}

export const AlertRules: { builtIn: AlertRule[] } = {
  builtIn: [
    {
      id: "coolant.high",
      titleKey: "alert.coolantHigh.title",
      bodyKey: "alert.coolantHigh.body",
      severity: "warning",
      cooldownS: 300,
      evaluate: (snap) => (snap.coolantC ?? 0) > 105,
    },
    {
      id: "coolant.critical",
      titleKey: "alert.coolantCritical.title",
      bodyKey: "alert.coolantCritical.body",
      severity: "critical",
      cooldownS: 120,
      evaluate: (snap) => (snap.coolantC ?? 0) > 115,
    },
    {
      id: "oil.high",
      titleKey: "alert.oilHigh.title",
      bodyKey: "alert.oilHigh.title",
      severity: "warning",
      cooldownS: 300,
      evaluate: (snap) => (snap.oilTempC ?? 0) > 125,
    },
    {
      id: "fuel.low",
      titleKey: "alert.fuelLow.title",
      bodyKey: "alert.fuelLow.title",
      severity: "warning",
      cooldownS: 900,
      evaluate: (snap) => (snap.fuelLevelPct ?? 100) < 12,
    },
    {
      id: "fuel.critical",
      titleKey: "alert.fuelCritical.title",
      bodyKey: "alert.fuelCritical.title",
      severity: "critical",
      cooldownS: 600,
      evaluate: (snap) => (snap.fuelLevelPct ?? 100) < 6,
    },
    {
      id: "voltage.low",
      titleKey: "alert.voltageLow.title",
      bodyKey: "alert.voltageLow.title",
      severity: "warning",
      cooldownS: 600,
      evaluate: (snap) => isEngineRunning(snap) && (snap.voltage ?? 14) < 12.0,
    },
    {
      id: "voltage.charging",
      titleKey: "alert.chargingLow.title",
      bodyKey: "alert.chargingLow.title",
      severity: "warning",
      cooldownS: 900,
      evaluate: (snap) => (snap.rpm ?? 0) > 900 && (snap.voltage ?? 14) < 13.2,
    },
    {
      id: "rpm.coldHigh",
      titleKey: "alert.coldRev.title",
      bodyKey: "alert.coldRev.body",
      severity: "info",
      cooldownS: 180,
      evaluate: (snap) => (snap.rpm ?? 0) > 3000 && (snap.coolantC ?? 99) < 60,
    },
    {
      id: "boost.high",
      titleKey: "metric.boost",
      bodyKey: "metric.boost",
      severity: "info",
      cooldownS: 600,
      evaluate: (snap) => (boostKpa(snap) ?? 0) > 130,
    },
    {
      id: "trim.high",
      titleKey: "alert.trimHigh.title",
      bodyKey: "alert.trimHigh.title",
      severity: "info",
      cooldownS: 3600,
      evaluate: (snap) => Math.abs(snap.ltftBank1 ?? 0) > 15,
    },
    {
      id: "catalyst.high",
      titleKey: "alert.catalystHigh.title",
      bodyKey: "alert.catalystHigh.title",
      severity: "warning",
      cooldownS: 600,
      evaluate: (snap) => (snap.catalystC ?? 0) > 900,
    },
    {
      id: "dtc.new",
      titleKey: "alert.newDTC.title",
      bodyKey: "alert.newDTC.title",
      severity: "critical",
      cooldownS: 3600,
      // triggered via AlertEngine.flagNewDTC(), not the predicate
      evaluate: () => false,
    },
  ],
};

export function hysteresisStillActive(ruleId: string, snap: VehicleSnapshot): boolean {
  switch (ruleId) {
    case "coolant.high":
      return (snap.coolantC ?? 0) > 105 * 0.95;
    case "coolant.critical":
      return (snap.coolantC ?? 0) > 115 * 0.95;
    case "oil.high":
      return (snap.oilTempC ?? 0) > 125 * 0.95;
    case "fuel.low":
      return (snap.fuelLevelPct ?? 100) < 12 * 1.05;
    case "fuel.critical":
      return (snap.fuelLevelPct ?? 100) < 6 * 1.05;
    case "voltage.low":
      return isEngineRunning(snap) && (snap.voltage ?? 14) < 12.0 * 1.05;
    case "voltage.charging":
      return (snap.rpm ?? 0) > 900 && (snap.voltage ?? 14) < 13.2 * 1.05;
    case "boost.high":
      return (boostKpa(snap) ?? 0) > 130 * 0.95;
    case "catalyst.high":
      return (snap.catalystC ?? 0) > 900 * 0.95;
    case "trim.high":
      return Math.abs(snap.ltftBank1 ?? 0) > 15 * 0.95;
    default:
      return false;
  }
}
