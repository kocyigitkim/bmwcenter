import { create } from "zustand";
import { db } from "../storage/db";
import { tripSamples } from "../storage/schema";
import { tripRepository } from "../storage/tripRepository";
import { locationProvider } from "./locationProvider";
import { useAppSettings } from "../settings/appSettings";
import { activeVehicleId } from "../vehicle/useGarage";
import { vehicleRepository } from "../vehicle/vehicleRepository";
import { maintenanceNotifier } from "../maintenance/maintenanceNotifier";
import { metricHistory } from "../metrics/metricHistory";
import { tripDiagnosticsWatcher } from "./tripDiagnosticsWatcher";
import { publishWidgetState } from "../widget/widgetPublisher";
import { FuelIntegrationState, fuelRateLh } from "../fuel/fuelCalculator";
import { speedCalibrator } from "../analysis/speedCalibrator";
import { useCareCoordinator } from "../care/careCoordinator";
import { isValidAvgL100 } from "../storage/models";
import * as DrivingScorer from "../analysis/drivingScorer";
import { boostKpa, type VehicleSnapshot } from "../obd/vehicleSnapshot";
import type { Trip, TripCategory } from "../storage/models";
import type { ConnectionState } from "../obd/obdTransport";

export type TripRecorderState =
  | { kind: "idle" }
  | { kind: "armed" }
  | { kind: "recording"; id: string }
  | { kind: "paused"; id: string };

export interface LiveTripMetrics {
  startedAt?: number;
  durationS: number;
  distanceKm: number;
  fuelUsedL: number;
  avgL100?: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  maxRpm: number;
  idleDurationS: number;
}

function emptyLive(): LiveTripMetrics {
  return { durationS: 0, distanceKm: 0, fuelUsedL: 0, avgSpeedKmh: 0, maxSpeedKmh: 0, maxRpm: 0, idleDurationS: 0 };
}

function newTripId(): string {
  return `trip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface PendingSample {
  t: number;
  speedKmh: number;
  rpm: number;
  fuelRateLh: number;
  coolantC: number;
  throttlePct: number;
  boostKpa: number;
  engineLoadPct: number | null;
  voltage: number | null;
  intakeAirC: number | null;
  mapKpa: number | null;
  mafGs: number | null;
  stftPct: number | null;
  ltftPct: number | null;
  oilTempC: number | null;
  fuelLevelPct: number | null;
  ambientC: number | null;
}

interface TripRecorderStore {
  state: TripRecorderState;
  live: LiveTripMetrics;

  manualStart: () => void;
  manualStop: () => void;
  toggle: () => void;
  handle: (snapshot: VehicleSnapshot, connection: ConnectionState) => Promise<void>;
}

let integration = new FuelIntegrationState();
let memorySamples: PendingSample[] = [];
let currentTrip: Trip | undefined;
let speedAboveThresholdSince: number | undefined;
let speedBelowSince: number | undefined;
let pausedSince: number | undefined;
let disconnectedSince: number | undefined;
let manualOverrideUntil: number | undefined;
let lastSampleAt: number | undefined;
let lastFlushAt = Date.now();
let lastProgressPersistAt = 0;
let movingDurationS = 0;
let idleDurationS = 0;
let maxSpeed = 0;
let maxRpm = 0;
let startFuelPct: number | undefined;
let routePoints: Array<{ lat: number; lon: number; t: number }> = [];
let lastRoutePointAt = 0;

const MAX_ROUTE_POINTS = 800;

function addRoutePoint(now: number) {
  const loc = locationProvider.lastLocation;
  if (!loc || now - lastRoutePointAt < 4000) return;
  lastRoutePointAt = now;
  routePoints.push({ lat: loc.latitude, lon: loc.longitude, t: now });
  if (routePoints.length > MAX_ROUTE_POINTS) {
    routePoints = routePoints.filter((_, i) => i % 2 === 0);
  }
}

async function beginTrip(manual: boolean, set: (partial: Partial<TripRecorderStore>) => void) {
  const now = Date.now();
  const trip: Trip = {
    id: newTripId(),
    startedAt: now,
    endedAt: null,
    distanceKm: 0,
    durationS: 0,
    movingDurationS: 0,
    idleDurationS: 0,
    fuelUsedL: 0,
    idleFuelL: 0,
    avgSpeedKmh: 0,
    maxSpeedKmh: 0,
    maxRpm: 0,
    avgL100: 0,
    startFuelPct: null,
    endFuelPct: null,
    startLatitude: null,
    startLongitude: null,
    endLatitude: null,
    endLongitude: null,
    startPlaceName: null,
    endPlaceName: null,
    routeData: null,
    isManual: manual,
    category: (useAppSettings.getState().defaultTripCategory as TripCategory) ?? "personal",
    dataSource: "obd",
    scoreTotal: null,
    scoreBreakdownJSON: null,
    note: null,
  };
  await tripRepository.insert(trip);
  currentTrip = trip;
  integration = new FuelIntegrationState();
  memorySamples = [];
  // The live graphs cover the drive in progress, not the one before it.
  metricHistory.clear();
  tripDiagnosticsWatcher.start(trip.id);
  publishWidgetState(Date.now(), true).catch(() => undefined);
  movingDurationS = 0;
  idleDurationS = 0;
  maxSpeed = 0;
  maxRpm = 0;
  startFuelPct = undefined;
  routePoints = [];
  lastRoutePointAt = 0;
  lastSampleAt = undefined;
  lastProgressPersistAt = now;
  speedAboveThresholdSince = undefined;
  speedBelowSince = undefined;
  pausedSince = undefined;
  locationProvider.resetDistance();
  locationProvider.start();
  set({ state: { kind: "recording", id: trip.id }, live: { ...emptyLive(), startedAt: trip.startedAt } });
}

function sample(snapshot: VehicleSnapshot, now: number, set: (partial: Partial<TripRecorderStore>) => void) {
  if (!currentTrip) return;
  const settings = useAppSettings.getState();
  if (startFuelPct == null) startFuelPct = snapshot.fuelLevelPct;

  const rate = fuelRateLh(
    snapshot,
    settings.fuelType,
    settings.displacementL,
    settings.volumetricEfficiency,
    settings.fuelCalibrationFactor
  );
  const speedFactor = settings.applySpeedCorrection ? settings.speedCalibrationFactor : 1.0;
  const speed = (snapshot.speedKmh ?? 0) * speedFactor;
  const rpm = snapshot.rpm ?? 0;

  integration.integrate({ t: now, speedKmh: speed, fuelRateLh: rate });
  tripDiagnosticsWatcher.onSample(snapshot, now);
  speedCalibrator.ingest(snapshot.speedKmh ?? 0, locationProvider.lastLocation, now);
  addRoutePoint(now);

  if (lastSampleAt != null) {
    const dt = (now - lastSampleAt) / 1000;
    if (speed >= 2) movingDurationS += dt;
    else idleDurationS += dt;
  }
  lastSampleAt = now;
  maxSpeed = Math.max(maxSpeed, speed);
  maxRpm = Math.max(maxRpm, rpm);

  const lastSample = memorySamples[memorySamples.length - 1];
  if (!lastSample || now - lastSample.t >= 1000) {
    memorySamples.push({
      t: now,
      speedKmh: speed,
      rpm,
      fuelRateLh: rate ?? 0,
      coolantC: snapshot.coolantC ?? 0,
      throttlePct: snapshot.throttlePct ?? 0,
      boostKpa: boostKpa(snapshot) ?? 0,
      // Null, not zero: a PID the car never answered must stay tellable apart
      // from one that genuinely read zero.
      engineLoadPct: snapshot.engineLoadPct ?? null,
      voltage: snapshot.voltage ?? null,
      intakeAirC: snapshot.intakeAirC ?? null,
      mapKpa: snapshot.mapKpa ?? null,
      mafGs: snapshot.mafGs ?? null,
      stftPct: snapshot.stftBank1 ?? null,
      ltftPct: snapshot.ltftBank1 ?? null,
      oilTempC: snapshot.oilTempC ?? null,
      fuelLevelPct: snapshot.fuelLevelPct ?? null,
      ambientC: snapshot.ambientC ?? null,
    });
  }

  const duration = (now - currentTrip.startedAt) / 1000;
  const avgSpeed = duration > 0 ? integration.distanceKm / (duration / 3600) : 0;
  set({
    live: {
      startedAt: currentTrip.startedAt,
      durationS: duration,
      distanceKm: integration.distanceKm,
      fuelUsedL: integration.fuelUsedL,
      avgL100: integration.avgL100,
      avgSpeedKmh: avgSpeed,
      maxSpeedKmh: maxSpeed,
      maxRpm: maxRpm,
      idleDurationS: idleDurationS,
    },
  });

  // Crash-safe periodic flush, or once memory grows large.
  if (now - lastFlushAt > 3 * 3600_000 || memorySamples.length > 600) {
    flushSamples();
    lastFlushAt = now;
  }
  // The Trip row is inserted with zeroed aggregates and only filled in at finalize, so
  // without this an in-progress trip reads as all-zero everywhere it is loaded from the
  // database — and a kill mid-trip would persist those zeros permanently.
  if (now - lastProgressPersistAt >= PROGRESS_PERSIST_MS) {
    lastProgressPersistAt = now;
    persistProgress(now).catch(() => undefined);
  }
}

const PROGRESS_PERSIST_MS = 30_000;

/** Writes the running aggregates onto the open Trip row. `endedAt` stays null so the
 * trip still reads as in-progress. */
async function persistProgress(now: number) {
  const trip = currentTrip;
  if (!trip) return;
  const duration = (now - trip.startedAt) / 1000;
  trip.distanceKm = integration.distanceKm;
  trip.durationS = duration;
  trip.movingDurationS = movingDurationS;
  trip.idleDurationS = idleDurationS;
  trip.fuelUsedL = integration.fuelUsedL;
  trip.idleFuelL = integration.idleFuelL;
  trip.avgSpeedKmh = duration > 0 ? integration.distanceKm / (duration / 3600) : 0;
  trip.maxSpeedKmh = maxSpeed;
  trip.maxRpm = maxRpm;
  trip.avgL100 = integration.avgL100 ?? 0;
  trip.startFuelPct = startFuelPct ?? null;
  await tripRepository.update(trip);
}

async function flushSamples() {
  if (!currentTrip || memorySamples.length === 0) return;
  const tripId = currentTrip.id;
  const rows = memorySamples.map((s) => ({ tripId, ...s }));
  await db.insert(tripSamples).values(rows);
  if (currentTrip.startLatitude == null && locationProvider.lastLocation) {
    currentTrip.startLatitude = locationProvider.lastLocation.latitude;
    currentTrip.startLongitude = locationProvider.lastLocation.longitude;
  }
  memorySamples = [];
}

async function finalizeTrip(discard: boolean, set: (partial: Partial<TripRecorderStore>) => void) {
  const trip = currentTrip;
  if (!trip) {
    set({ state: { kind: "idle" }, live: emptyLive() });
    return;
  }
  const now = Date.now();
  const duration = (now - trip.startedAt) / 1000;
  const shouldDiscard = discard || (integration.distanceKm < 0.3 && duration < 60);

  if (shouldDiscard) {
    await tripRepository.deleteTrip(trip.id);
  } else {
    await flushSamples();
    trip.endedAt = now;
    trip.distanceKm = integration.distanceKm;
    trip.durationS = duration;
    trip.movingDurationS = movingDurationS;
    trip.idleDurationS = idleDurationS;
    trip.fuelUsedL = integration.fuelUsedL;
    trip.idleFuelL = integration.idleFuelL;
    trip.avgSpeedKmh = duration > 0 ? integration.distanceKm / (duration / 3600) : 0;
    trip.maxSpeedKmh = maxSpeed;
    trip.maxRpm = maxRpm;
    trip.avgL100 = integration.avgL100 ?? 0;
    trip.startFuelPct = startFuelPct ?? null;
    trip.routeData = routePoints.length > 1 ? routePoints : null;
    if (locationProvider.lastLocation) {
      trip.endLatitude = locationProvider.lastLocation.latitude;
      trip.endLongitude = locationProvider.lastLocation.longitude;
    }

    const monthTrips = await tripRepository.monthTrips();
    const baselineValues = monthTrips.map((t) => t.avgL100).filter(isValidAvgL100);
    const baselineAvg = baselineValues.length
      ? baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length
      : undefined;
    const breakdown = DrivingScorer.score({
      distanceKm: trip.distanceKm,
      events: [],
      overspeedDurationRatio: 0,
      idleRatio: duration > 0 ? idleDurationS / duration : 0,
      avgL100: trip.avgL100 || undefined,
      baselineL100: baselineAvg,
    });
    trip.scoreTotal = DrivingScorer.scoreTotal(breakdown);
    trip.scoreBreakdownJSON = JSON.stringify(breakdown);

    await tripRepository.update(trip);

    // The odometer is what maintenance intervals are measured against, so it
    // advances with every trip we actually recorded.
    const vehicleId = activeVehicleId();
    if (vehicleId) await vehicleRepository.addDistance(vehicleId, trip.distanceKm);
    maintenanceNotifier.check().catch(() => undefined);
    publishWidgetState(Date.now(), true).catch(() => undefined);

    const settings = useAppSettings.getState();
    settings.set("lastParkingLatitude", trip.endLatitude);
    settings.set("lastParkingLongitude", trip.endLongitude);
    settings.set("lastParkingPlaceName", trip.endPlaceName);

    useCareCoordinator.getState().onTripEnded(trip).catch(() => undefined);
  }

  currentTrip = undefined;
  memorySamples = [];
  tripDiagnosticsWatcher.stop();
  integration = new FuelIntegrationState();
  lastSampleAt = undefined;
  pausedSince = undefined;
  speedBelowSince = undefined;
  speedAboveThresholdSince = undefined;
  locationProvider.stop();
  set({ state: { kind: "idle" }, live: emptyLive() });
}

export const useTripRecorder = create<TripRecorderStore>((set, get) => ({
  state: { kind: "idle" },
  live: emptyLive(),

  manualStart: () => {
    manualOverrideUntil = Date.now() + 600_000;
    beginTrip(true, set);
  },
  manualStop: () => {
    manualOverrideUntil = Date.now() + 600_000;
    finalizeTrip(false, set);
  },
  toggle: () => {
    const { state } = get();
    if (state.kind === "recording" || state.kind === "paused") get().manualStop();
    else get().manualStart();
  },

  handle: async (snapshot, connection) => {
    const settings = useAppSettings.getState();
    const now = Date.now();
    const rpm = snapshot.rpm ?? 0;
    const speed = snapshot.speedKmh ?? 0;
    const connected = connection.status === "connected";

    if (!connected) {
      if (disconnectedSince == null) disconnectedSince = now;
    } else {
      disconnectedSince = undefined;
    }

    const overrideActive = (manualOverrideUntil ?? 0) > now;
    const { state } = get();

    switch (state.kind) {
      case "idle": {
        if (!overrideActive && settings.autoRecordTrips && (rpm > 300 || connected)) {
          set({ state: { kind: "armed" } });
        }
        break;
      }
      case "armed": {
        if (rpm <= 300 && !connected) {
          set({ state: { kind: "idle" } });
          break;
        }
        if (speed > settings.startThresholdKmh) {
          if (speedAboveThresholdSince == null) speedAboveThresholdSince = now;
          if (now - speedAboveThresholdSince >= 3000) {
            await beginTrip(false, set);
          }
        } else {
          speedAboveThresholdSince = undefined;
        }
        break;
      }
      case "recording": {
        sample(snapshot, now, set);
        if (speed < 2) {
          if (speedBelowSince == null) speedBelowSince = now;
          if (now - speedBelowSince >= 20_000) {
            pausedSince = now;
            set({ state: { kind: "paused", id: state.id } });
          }
        } else {
          speedBelowSince = undefined;
        }
        if (rpm === 0 && (integration.prevSpeedKmh() ?? 0) < 2) {
          await finalizeTrip(false, set);
        } else if (disconnectedSince != null && now - disconnectedSince >= 30_000) {
          await finalizeTrip(false, set);
        }
        break;
      }
      case "paused": {
        sample(snapshot, now, set);
        if (speed > settings.startThresholdKmh) {
          pausedSince = undefined;
          speedBelowSince = undefined;
          set({ state: { kind: "recording", id: state.id } });
        } else {
          const pauseElapsed = now - (pausedSince ?? now);
          const disconnectElapsed = disconnectedSince != null ? now - disconnectedSince : 0;
          if (pauseElapsed >= settings.stopDelayS * 1000 || rpm === 0 || disconnectElapsed >= 30_000) {
            await finalizeTrip(false, set);
          }
        }
        break;
      }
    }
  },
}));
