/**
 * Writes the file the home-screen widget reads.
 *
 * There is no native bridge: the widget lives in the app's own process and
 * reads `quickcar-widget.json` from the files directory. That keeps the whole
 * feature to one plain file and no Kotlin that has to be kept in step with the
 * app's data model.
 */

import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import i18n from "@/i18n";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "../settings/appSettings";
import { useOBDStore } from "../obd/obdService";
import { useTripRecorder } from "../trip/tripRecorder";
import { tripRepository } from "../storage/tripRepository";
import { activeVehicle } from "../vehicle/useGarage";
import { displayedOdometerKm } from "../vehicle/vehicleRepository";
import * as DM from "../dashboard/dashMetrics";
import * as FC from "../fuel/fuelCalculator";
import { buildWidgetState, isRecentEnough, isWorthWriting, type WidgetState } from "./widgetState";

const FILE_NAME = "quickcar-widget.json";
/** The widget refreshes on its own schedule; writing faster is wasted work. */
const MIN_INTERVAL_MS = 30_000;

let lastState: WidgetState | undefined;
let lastWriteAt = 0;
let writing = false;

export async function publishWidgetState(now = Date.now(), force = false): Promise<void> {
  // iOS widgets need an app extension and a shared container, neither of which
  // exists here. Pretending otherwise would just burn writes.
  if (Platform.OS !== "android") return;
  if (writing) return;
  if (!force && now - lastWriteAt < MIN_INTERVAL_MS) return;

  writing = true;
  try {
    const state = await gatherState(now);
    if (!isWorthWriting(lastState, state)) return;

    const file = new File(Paths.document, FILE_NAME);
    file.create({ overwrite: true });
    file.write(JSON.stringify(state));
    lastState = state;
    lastWriteAt = now;
  } catch {
    // The widget keeps showing what it had. Nothing here is worth an error to
    // the user, who did not ask for a file to be written.
  } finally {
    writing = false;
  }
}

async function gatherState(now: number): Promise<WidgetState> {
  const settings = useAppSettings.getState();
  const snapshot = useOBDStore.getState().snapshot;
  const recorder = useTripRecorder.getState();
  const vehicle = activeVehicle();
  const t = i18n.t.bind(i18n);

  const rate = FC.fuelRateLh(
    snapshot,
    settings.fuelType,
    settings.displacementL,
    settings.volumetricEfficiency,
    settings.fuelCalibrationFactor
  );
  const { l100 } = FC.instantL100(rate, snapshot.speedKmh);
  const rangeKm = DM.rangeKm(snapshot, l100, settings.tankCapacityL);

  const recording = recorder.state.kind === "recording" || recorder.state.kind === "paused";
  const live = recording
    ? {
        distanceText: Formatters.distance(recorder.live.distanceKm, settings),
        consumptionText:
          (recorder.live.avgL100 ?? 0) > 0
            ? Formatters.consumption(recorder.live.avgL100, settings)
            : t("trip.live.inProgress"),
      }
    : undefined;

  const recent = await tripRepository.recentTrips(1).catch(() => []);
  const previous = recent.find((trip) => trip.endedAt != null);
  const lastTrip =
    previous?.endedAt != null && isRecentEnough(previous.endedAt, now)
      ? {
          distanceText: Formatters.distance(previous.distanceKm, settings),
          consumptionText:
            previous.avgL100 > 0 ? Formatters.consumption(previous.avgL100, settings) : undefined,
          endedAt: previous.endedAt,
        }
      : undefined;

  return buildWidgetState({
    now,
    vehicleName: vehicle?.name || settings.vehicleName,
    fuelLevelPct: snapshot.fuelLevelPct,
    fuelLevelText: snapshot.fuelLevelPct != null ? Formatters.percent(snapshot.fuelLevelPct) : undefined,
    rangeText: rangeKm != null ? Formatters.distance(rangeKm, settings) : undefined,
    odometerText: vehicle ? Formatters.odometer(displayedOdometerKm(vehicle), settings) : undefined,
    live,
    lastTrip,
  });
}

/** Forgets what was last written, so the next publish always goes through. */
export function resetWidgetCache(): void {
  lastState = undefined;
  lastWriteAt = 0;
}
