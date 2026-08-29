/**
 * Gathers every reading a widget could want, once.
 *
 * Designs name metrics; this fills them in. It runs once per publish no matter
 * how many widgets are placed, so adding a design costs nothing at runtime, and
 * every value is formatted here — in the same code the app's own screens use —
 * so a widget can never disagree with the app about what a number means.
 */

import i18n from "@/i18n";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "../settings/appSettings";
import { useOBDStore } from "../obd/obdService";
import { useTripRecorder } from "../trip/tripRecorder";
import { tripRepository } from "../storage/tripRepository";
import { maintenanceRepository } from "../storage/maintenanceRepository";
import { activeVehicle } from "../vehicle/useGarage";
import { displayedOdometerKm } from "../vehicle/vehicleRepository";
import { loadHealthReport } from "../health/healthRepository";
import { compareByUrgency, isActionable } from "../maintenance/maintenanceSchedule";
import { categoryOf, startOfMonth, startOfNextMonth, summarise } from "../mileage/mileageLog";
import * as DM from "../dashboard/dashMetrics";
import * as FC from "../fuel/fuelCalculator";
import { emptyDataSet, type WidgetDataSet, type WidgetMetricId } from "./widgetMetrics";

/** Any one reading failing must not empty the whole widget. */
async function safe<T>(work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch {
    return fallback;
  }
}

export async function gatherWidgetData(now = Date.now()): Promise<WidgetDataSet> {
  const settings = useAppSettings.getState();
  const snapshot = useOBDStore.getState().snapshot;
  const recorder = useTripRecorder.getState();
  const vehicle = activeVehicle();
  const t = i18n.t.bind(i18n);

  const data = emptyDataSet(vehicle?.name || settings.vehicleName || "QuickCar");
  const text = data.text as Record<WidgetMetricId, string | undefined>;
  const fraction = data.fraction as Record<WidgetMetricId, number | undefined>;

  // --- live readings -------------------------------------------------------
  if (snapshot.fuelLevelPct != null) {
    text.fuelLevel = Formatters.percent(snapshot.fuelLevelPct);
    fraction.fuelLevel = snapshot.fuelLevelPct / 100;
  }
  if (snapshot.coolantC != null) {
    text.coolant = Formatters.temperature(snapshot.coolantC, settings);
    // 120 °C is past any sane alarm point, so it makes a usable bar ceiling.
    fraction.coolant = snapshot.coolantC / 120;
  }
  if (snapshot.voltage != null) text.voltage = `${Formatters.number(snapshot.voltage, 1)} V`;
  if (snapshot.engineLoadPct != null) {
    text.engineLoad = Formatters.percent(snapshot.engineLoadPct);
    fraction.engineLoad = snapshot.engineLoadPct / 100;
  }
  if (snapshot.speedKmh != null) text.speed = Formatters.speed(snapshot.speedKmh, settings);
  if (snapshot.rpm != null) text.rpm = `${Formatters.number(snapshot.rpm, 0)} rpm`;

  const rate = FC.fuelRateLh(
    snapshot,
    settings.fuelType,
    settings.displacementL,
    settings.volumetricEfficiency,
    settings.fuelCalibrationFactor
  );
  const { l100 } = FC.instantL100(rate, snapshot.speedKmh);
  const rangeKm = DM.rangeKm(snapshot, l100, settings.tankCapacityL);
  if (rangeKm != null) text.range = Formatters.distance(rangeKm, settings);

  if (vehicle) text.odometer = Formatters.odometer(displayedOdometerKm(vehicle), settings);

  // --- the trip in progress ------------------------------------------------
  const recording = recorder.state.kind === "recording" || recorder.state.kind === "paused";
  data.recording = recording;
  text.tripState = t(recording ? "trip.live.recording" : "widget.state.parked");
  if (recording) {
    text.liveDistance = Formatters.distance(recorder.live.distanceKm, settings);
    text.liveDuration = Formatters.duration(recorder.live.durationS);
    if ((recorder.live.avgL100 ?? 0) > 0) {
      text.liveConsumption = Formatters.consumption(recorder.live.avgL100, settings);
    }
  }

  // --- recorded history ----------------------------------------------------
  const pricePerLiter = settings.pricePerLiter;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const recent = await safe(() => tripRepository.recentTrips(1), []);
  const last = recent.find((trip) => trip.endedAt != null);
  if (last) {
    text.lastTripDistance = Formatters.distance(last.distanceKm, settings);
    if (last.avgL100 > 0) text.lastTripConsumption = Formatters.consumption(last.avgL100, settings);
    text.lastTripCost = Formatters.currency(last.fuelUsedL * pricePerLiter, settings.currencyCode);
    text.lastTripWhen = new Date(last.endedAt!).toLocaleDateString(i18n.language, {
      day: "numeric",
      month: "short",
    });
  }

  const today = await safe(
    () => tripRepository.trips({ start: startOfToday.getTime(), end: now + 1 }),
    []
  );
  const todayDistance = today.reduce((sum, trip) => sum + trip.distanceKm, 0);
  text.todayDistance = Formatters.distance(todayDistance, settings);
  text.todayCost = Formatters.currency(
    today.reduce((sum, trip) => sum + trip.fuelUsedL, 0) * pricePerLiter,
    settings.currencyCode
  );
  text.todayTrips = String(today.length);

  const monthFrom = startOfMonth(now);
  const monthTrips = await safe(
    () => tripRepository.trips({ start: monthFrom, end: startOfNextMonth(now) }),
    []
  );
  const mileage = summarise(
    monthTrips
      .filter((trip) => trip.endedAt != null)
      .map((trip) => ({
        id: trip.id,
        startedAt: trip.startedAt,
        endedAt: trip.endedAt,
        distanceKm: trip.distanceKm,
        fuelUsedL: trip.fuelUsedL,
        category: trip.category,
        startPlaceName: trip.startPlaceName,
        endPlaceName: trip.endPlaceName,
        note: trip.note,
      })),
    pricePerLiter,
    monthFrom,
    startOfNextMonth(now)
  );
  text.monthDistance = Formatters.distance(mileage.totalDistanceKm, settings);
  text.monthCost = Formatters.currency(mileage.totalFuelCost, settings.currencyCode);

  const business = mileage.byCategory.find((c) => c.category === "business")!;
  text.businessDistance = Formatters.distance(business.distanceKm, settings);
  text.businessShare = Formatters.percent(mileage.businessShare * 100);
  fraction.businessShare = mileage.businessShare;

  // --- health and maintenance ---------------------------------------------
  const health = await safe(() => loadHealthReport(now), undefined);
  if (health?.overallScore != null) {
    text.healthScore = String(health.overallScore);
    fraction.healthScore = health.overallScore / 100;
    text.healthGrade = t(`health.grade.${health.overallGrade}`);
  } else if (health) {
    text.healthGrade = t("health.grade.unknown");
  }

  const schedule = await safe(() => maintenanceRepository.schedule(now), []);
  const tracked = schedule.filter((item) => item.isEnabled && item.due.status !== "unknown");
  const next = [...tracked].sort((a, b) => compareByUrgency(a.due, b.due))[0];
  if (next) {
    text.nextServiceItem = next.customTitle ?? t(next.titleKey, { defaultValue: next.titleKey });
    text.nextServiceDue = describeDue(next.due, settings, t);
    // The bar fills as the interval is used up, so a full bar means due now.
    fraction.nextServiceDue = next.due.progress;
  }

  const faults = health?.categories.reduce((sum, c) => sum + c.evidence.filter((e) => e.key.includes("dtc")).length, 0);
  if (faults != null) text.openFaults = String(faults);

  return data;
}

function describeDue(
  due: { status: string; remainingKm?: number; remainingDays?: number; driver?: string },
  settings: Parameters<typeof Formatters.odometer>[1],
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (due.status === "overdue") return t("widget.service.overdue");
  if (due.driver === "distance" && due.remainingKm != null) {
    return Formatters.odometer(Math.max(0, due.remainingKm), settings);
  }
  if (due.remainingDays != null) {
    return t("widget.service.inDays", { count: Math.max(0, Math.round(due.remainingDays)) });
  }
  return t("widget.service.overdue");
}
