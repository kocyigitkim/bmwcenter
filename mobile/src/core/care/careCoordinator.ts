import { create } from "zustand";
import { overheatWatchdog } from "./overheatWatchdog";
import { coldEngineShield } from "./coldEngineShield";
import { thermalShockGuard } from "./thermalShockGuard";
import { batteryGuardian } from "./batteryGuardian";
import { fuelTrimMonitor } from "./fuelTrimMonitor";
import { thermostatWatch } from "./thermostatWatch";
import { engineReadyService } from "./engineReadyService";
import { ecoCoach } from "./ecoCoach";
import { gearCoach } from "./gearCoach";
import { adaptiveMaintenance } from "./adaptiveMaintenance";
import { challengeEngine } from "./challengeEngine";
import { streakService } from "./streakService";
import { badgeService } from "./badgeService";
import { cueScheduler } from "./cueScheduler";
import { emptyCareContext } from "./careTypes";
import { alertSeverityFrom } from "./severityRouter";
import { buildTripSummaryCard, shouldRenderTripCard, type TripSummaryCardModel } from "./tripSummaryCard";
import { useAppSettings } from "../settings/appSettings";
import { effectivePricePerLiter } from "../fuel/effectivePrice";
import type { VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip } from "../storage/models";
import type { CareCue, CareContext } from "./careTypes";
import type { ActiveAlert } from "../alerts/alertTypes";
import type { CareFeature } from "./careFeature";

const FEATURES: CareFeature[] = [
  coldEngineShield,
  engineReadyService,
  overheatWatchdog,
  thermalShockGuard,
  batteryGuardian,
  ecoCoach,
  gearCoach,
  challengeEngine,
  fuelTrimMonitor,
  thermostatWatch,
  adaptiveMaintenance,
];

interface CareCoordinatorState {
  activeChips: ActiveAlert[];
  readiness: number;
  isEngineReady: boolean;
  readinessLabel?: string;
  liveEcoScore: number;
  thermalCountdownS?: number;
  fullScreenCue?: CareCue;
  tripSummaryCard?: TripSummaryCardModel;

  evaluate: (snapshot: VehicleSnapshot, now?: number) => void;
  onTripEnded: (trip: Trip) => Promise<void>;
  dismissFullScreenCue: () => void;
  dismissTripCard: () => void;
}

let context: CareContext = emptyCareContext();
let cleanWarmups = 0;
let tripCount = 0;
let lastEval = 0;

/** Coolant/overheat protection cues are safety-critical and stay on even with "Enable
 * alerts" off — mirrors the forced full-screen/spoken overheat override elsewhere. */
function isForcedOverheatCue(cue: CareCue): boolean {
  return cue.id.startsWith("overheat.") && (cue.severity === "protective" || cue.severity === "critical");
}

/** "Enable alerts" is the master switch: off means no chips/cues/notifications from the
 * Care coordinator either, not just the built-in AlertEngine rules — except the forced
 * overheat safety cue above. */
function filterForEnableAlerts(cues: CareCue[], settings: { enableAlerts: boolean }): CareCue[] {
  return settings.enableAlerts ? cues : cues.filter(isForcedOverheatCue);
}

cueScheduler.onPresented = (cue, plan) => {
  const isForcedOverheat = cue.id.startsWith("overheat.") && (cue.severity === "protective" || cue.severity === "critical");
  if (plan.fullScreen || isForcedOverheat) {
    useCareCoordinator.setState({ fullScreenCue: cue });
  }
  if (plan.phoneChip) {
    const alert: ActiveAlert = { id: cue.id, title: cue.text, severity: alertSeverityFrom(cue.severity) };
    useCareCoordinator.setState((s) => {
      if (s.activeChips.some((a) => a.id === alert.id)) return s;
      return { activeChips: [alert, ...s.activeChips].slice(0, 6) };
    });
  }
};

function applyCueFrequency() {
  const settings = useAppSettings.getState();
  switch (settings.careCueFrequency) {
    case "low":
      cueScheduler.updateFrequency(1.5);
      break;
    case "high":
      cueScheduler.updateFrequency(0.7);
      break;
    default:
      cueScheduler.updateFrequency(1.0);
  }
}

function sensitivityOffset(): number {
  const settings = useAppSettings.getState();
  if (settings.careSensitivity === "early") return -2;
  if (settings.careSensitivity === "calm") return 2;
  return 0;
}

export const useCareCoordinator = create<CareCoordinatorState>((set, get) => ({
  activeChips: [],
  readiness: 0,
  isEngineReady: false,
  liveEcoScore: 100,

  evaluate: (snapshot, now = Date.now()) => {
    if (now - lastEval < 1000) return;
    lastEval = now;

    applyCueFrequency();
    const settings = useAppSettings.getState();

    context = {
      ...context,
      now,
      ambientC: snapshot.ambientC ?? context.ambientC,
      oilTempC: snapshot.oilTempC,
      oilIsEstimated: snapshot.oilTempC == null,
      sensitivityOffsetC: sensitivityOffset(),
      isVehicleStopped: (snapshot.speedKmh ?? 0) < 2,
    };

    const allCues: CareCue[] = filterForEnableAlerts(
      FEATURES.flatMap((feature) => (feature.isEnabled(settings) ? feature.evaluate(snapshot, context) : [])),
      settings
    );

    if (settings.careSpokenCues) {
      cueScheduler.enqueueAll(allCues, now);
    } else {
      allCues.filter((c) => c.severity === "protective" || c.severity === "critical").forEach((c) => cueScheduler.enqueue(c, now));
    }

    set({
      readiness: engineReadyService.readiness,
      isEngineReady: engineReadyService.isReady,
      readinessLabel: engineReadyService.remainingLabel,
      liveEcoScore: ecoCoach.liveScore,
      thermalCountdownS: thermalShockGuard.countdownSeconds,
    });
  },

  onTripEnded: async (trip) => {
    const settings = useAppSettings.getState();
    context = { ...context, tripDistanceKm: trip.distanceKm, tripDurationS: trip.durationS, isVehicleStopped: true };

    const endCues: CareCue[] = [];
    for (const feature of FEATURES) {
      if (!feature.isEnabled(settings) || !feature.onTripEnded) continue;
      endCues.push(...(await feature.onTripEnded(trip, context)));
    }
    cueScheduler.enqueueAll(filterForEnableAlerts(endCues, settings), Date.now());

    const hadViolation = coldEngineShield.coldViolationsThisTrip > 0;
    if (!hadViolation) cleanWarmups += 1;
    tripCount += 1;

    await streakService.recordDay(trip.scoreTotal ?? 0, hadViolation);
    await badgeService.evaluateAwards({
      isStopped: true,
      cleanWarmups,
      compliantCooldowns: 0,
      harshAccelKm: 0,
      tripCount,
      longHaulKm: trip.distanceKm,
      thermostatCaught: false,
    });

    if (settings.careTripSummaryCard && shouldRenderTripCard(trip.distanceKm)) {
      const model = buildTripSummaryCard(trip, settings.vehicleName, effectivePricePerLiter(), settings.currencyCode, !hadViolation, settings.careHideLocationSharing);
      setTimeout(() => useCareCoordinator.setState({ tripSummaryCard: model }), 1500);
    }

    coldEngineShield.resetTrip();
    engineReadyService.resetTrip();
    ecoCoach.resetTrip();
    thermalShockGuard.resetTrip();
  },

  dismissFullScreenCue: () => set({ fullScreenCue: undefined }),
  dismissTripCard: () => set({ tripSummaryCard: undefined }),
}));
