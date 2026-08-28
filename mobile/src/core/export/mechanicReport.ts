/**
 * A report to hand a workshop.
 *
 * A mechanic's first twenty minutes go on questions the owner cannot answer:
 * which codes, stored or pending, under what conditions, is the car even ready
 * for an emissions test, what has been serviced. All of that is already in the
 * app; this puts it on one page.
 *
 * The rendering is deliberately separate from the collection so the layout can
 * be tested without a database, and so the report can state plainly where it
 * has nothing to say — a blank section is a claim of its own.
 */

import { desc, eq, isNull, or } from "drizzle-orm";
import * as Print from "expo-print";
import i18n from "@/i18n";
import { db } from "../storage/db";
import { dtcRecords, refuelEntries } from "../storage/schema";
import { tripRepository } from "../storage/tripRepository";
import { maintenanceRepository, type ScheduledMaintenanceItem } from "../storage/maintenanceRepository";
import { summarize, emptyDrivingSummary, type DrivingSummary } from "../storage/models";
import { activeVehicle, activeVehicleId, activeVehicleAdoptsOrphans } from "../vehicle/useGarage";
import { displayedOdometerKm } from "../vehicle/vehicleRepository";
import { lastReadiness, loadHealthReport, type StoredReadiness } from "../health/healthRepository";
import { summaryFor } from "../obd/dtcCatalog";
import { useAppSettings } from "../settings/appSettings";
import type { FreezeFrameValues } from "../obd/freezeFrame";
import type { HealthReport } from "../health/healthScore";

export interface ReportCode {
  code: string;
  status: string;
  seenAt: number;
  description?: string;
  freezeFrame?: FreezeFrameValues;
}

export interface MechanicReportData {
  generatedAt: number;
  vehicle: {
    name: string;
    vin?: string;
    fuelType: string;
    odometerKm: number;
  };
  codes: ReportCode[];
  /** Codes cleared in the past, kept because a code that keeps coming back is
   * the most useful thing a workshop can be told. */
  clearedCodes: ReportCode[];
  readiness?: StoredReadiness;
  health?: HealthReport;
  maintenance: ScheduledMaintenanceItem[];
  driving: DrivingSummary;
  drivingFromDays: number;
  refuels: { count: number; litres: number; cost: number };
  currencyCode: string;
}

const RECENT_DAYS = 90;

export async function collectMechanicReport(now = Date.now()): Promise<MechanicReportData> {
  const settings = useAppSettings.getState();
  const vehicle = activeVehicle();
  const vehicleId = activeVehicleId();
  const since = now - RECENT_DAYS * 86_400_000;

  // Rows written before the garage existed have no owner; an upgraded install
  // must not produce a report that looks like a car with no history, but a car
  // the user described must not silently claim another's codes either.
  const adopts = activeVehicleAdoptsOrphans();
  const ownsCodes = !vehicleId
    ? undefined
    : adopts
      ? or(eq(dtcRecords.vehicleId, vehicleId), isNull(dtcRecords.vehicleId))
      : eq(dtcRecords.vehicleId, vehicleId);
  const ownsRefuels = !vehicleId
    ? undefined
    : adopts
      ? or(eq(refuelEntries.vehicleId, vehicleId), isNull(refuelEntries.vehicleId))
      : eq(refuelEntries.vehicleId, vehicleId);

  const [codeRows, refuelRows, trips, maintenance] = await Promise.all([
    db.select().from(dtcRecords).where(ownsCodes).orderBy(desc(dtcRecords.seenAt)),
    db.select().from(refuelEntries).where(ownsRefuels),
    tripRepository.trips({ start: since, end: now }),
    maintenanceRepository.schedule(now),
  ]);

  const health = await loadHealthReport(now).catch(() => undefined);

  const toReportCode = (row: (typeof codeRows)[number]): ReportCode => ({
    code: row.code,
    status: row.status,
    seenAt: row.seenAt,
    description: summaryFor(row.code, i18n.language),
    freezeFrame: parseFreezeFrame(row.freezeFrameJSON),
  });

  const recentRefuels = refuelRows.filter((r) => r.date >= since);

  return {
    generatedAt: now,
    vehicle: {
      name: vehicle?.name || settings.vehicleName || "Vehicle",
      vin: vehicle?.vin ?? settings.lastVIN ?? undefined,
      fuelType: vehicle?.fuelType ?? settings.fuelType,
      odometerKm: vehicle ? displayedOdometerKm(vehicle) : 0,
    },
    codes: codeRows.filter((r) => r.clearedAt == null).map(toReportCode),
    clearedCodes: codeRows.filter((r) => r.clearedAt != null).map(toReportCode),
    readiness: lastReadiness(),
    health,
    maintenance,
    driving: trips.length > 0 ? summarize(trips, settings.pricePerLiter) : emptyDrivingSummary(),
    drivingFromDays: RECENT_DAYS,
    refuels: {
      count: recentRefuels.length,
      litres: recentRefuels.reduce((sum, r) => sum + r.liters, 0),
      cost: recentRefuels.reduce((sum, r) => sum + r.totalCost, 0),
    },
    currencyCode: settings.currencyCode,
  };
}

function parseFreezeFrame(json: string | null): FreezeFrameValues | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as FreezeFrameValues;
  } catch {
    return undefined;
  }
}

export async function buildMechanicReportPDF(now = Date.now()): Promise<string | undefined> {
  try {
    const data = await collectMechanicReport(now);
    const html = renderMechanicReportHTML(data, i18n.t.bind(i18n));
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  } catch {
    return undefined;
  }
}

// --- rendering -------------------------------------------------------------

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Anything that reaches the page can contain a user-typed vehicle name or a
 * code description from the catalog, so nothing is interpolated raw. */
export function escapeHTML(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function num(value: number | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function date(ms: number | undefined): string {
  if (ms == null) return "—";
  return new Date(ms).toISOString().slice(0, 10);
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHTML(title)}</h2>${body}</section>`;
}

function emptyNote(text: string): string {
  return `<p class="empty">${escapeHTML(text)}</p>`;
}

export function renderMechanicReportHTML(data: MechanicReportData, t: Translate): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>${STYLE}</style></head>
<body>
  <header>
    <h1>${escapeHTML(t("report.title"))}</h1>
    <p class="sub">${escapeHTML(data.vehicle.name)} · ${escapeHTML(date(data.generatedAt))}</p>
  </header>
  ${renderVehicle(data, t)}
  ${renderCodes(data, t)}
  ${renderReadiness(data, t)}
  ${renderHealth(data, t)}
  ${renderMaintenance(data, t)}
  ${renderDriving(data, t)}
  <footer>${escapeHTML(t("report.footer"))}</footer>
</body></html>`;
}

function renderVehicle(data: MechanicReportData, t: Translate): string {
  const rows: Array<[string, string]> = [
    [t("report.vehicle.name"), data.vehicle.name],
    [t("report.vehicle.vin"), data.vehicle.vin ?? t("report.notRecorded")],
    [t("report.vehicle.fuel"), t(`fuelType.${data.vehicle.fuelType}`, { defaultValue: data.vehicle.fuelType })],
    [t("report.vehicle.odometer"), `${num(data.vehicle.odometerKm)} km`],
  ];
  return section(
    t("report.section.vehicle"),
    `<table>${rows.map(([k, v]) => `<tr><th>${escapeHTML(k)}</th><td>${escapeHTML(v)}</td></tr>`).join("")}</table>`
  );
}

function renderCodes(data: MechanicReportData, t: Translate): string {
  if (data.codes.length === 0 && data.clearedCodes.length === 0) {
    return section(t("report.section.codes"), emptyNote(t("report.codes.none")));
  }

  const body = data.codes.length
    ? `<table class="grid">
        <tr><th>${escapeHTML(t("report.codes.code"))}</th>
            <th>${escapeHTML(t("report.codes.status"))}</th>
            <th>${escapeHTML(t("report.codes.seen"))}</th>
            <th>${escapeHTML(t("report.codes.description"))}</th></tr>
        ${data.codes
          .map(
            (c) => `<tr>
              <td class="mono">${escapeHTML(c.code)}</td>
              <td>${escapeHTML(t(`dtc.status.${c.status}`, { defaultValue: c.status }))}</td>
              <td>${escapeHTML(date(c.seenAt))}</td>
              <td>${escapeHTML(c.description ?? "—")}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : emptyNote(t("report.codes.noneActive"));

  const frames = data.codes
    .filter((c) => c.freezeFrame)
    .map((c) => renderFreezeFrame(c, t))
    .join("");

  const cleared = data.clearedCodes.length
    ? `<p class="note">${escapeHTML(t("report.codes.clearedIntro"))}</p>
       <p class="mono small">${data.clearedCodes.map((c) => escapeHTML(`${c.code} (${date(c.seenAt)})`)).join(", ")}</p>`
    : "";

  return section(t("report.section.codes"), body + frames + cleared);
}

function renderFreezeFrame(code: ReportCode, t: Translate): string {
  const frame = code.freezeFrame!;
  // The annotation cannot sit on the filtered expression: contextual tuple
  // typing does not flow back through `.filter`.
  const all: Array<[string, string]> = [
    [t("metric.rpm"), num(frame.rpm)],
    [t("metric.speed"), frame.speedKmh != null ? `${num(frame.speedKmh)} km/h` : "—"],
    [t("metric.coolant"), frame.coolantC != null ? `${num(frame.coolantC)} °C` : "—"],
    [t("metric.engineLoad"), frame.engineLoadPct != null ? `${num(frame.engineLoadPct)} %` : "—"],
    [t("metric.throttle"), frame.throttlePct != null ? `${num(frame.throttlePct)} %` : "—"],
    [t("metric.intakeAir"), frame.intakeAirC != null ? `${num(frame.intakeAirC)} °C` : "—"],
    [t("metric.map"), frame.mapKpa != null ? `${num(frame.mapKpa)} kPa` : "—"],
    [t("metric.maf"), frame.mafGs != null ? `${num(frame.mafGs, 2)} g/s` : "—"],
    [t("metric.fuelTrimShort"), frame.fuelTrimShortPct != null ? `${num(frame.fuelTrimShortPct, 1)} %` : "—"],
    [t("metric.fuelTrimLong"), frame.fuelTrimLongPct != null ? `${num(frame.fuelTrimLongPct, 1)} %` : "—"],
  ];
  const rows = all.filter(([, value]) => value !== "—");

  if (rows.length === 0) return "";

  const mismatch =
    frame.triggerCode && frame.triggerCode !== code.code
      ? `<p class="note small">${escapeHTML(t("report.freezeFrame.mismatch", { code: frame.triggerCode }))}</p>`
      : "";

  return `<div class="frame">
    <h3>${escapeHTML(t("report.freezeFrame.title", { code: code.code }))}</h3>
    ${mismatch}
    <table>${rows.map(([k, v]) => `<tr><th>${escapeHTML(k)}</th><td>${escapeHTML(v)}</td></tr>`).join("")}</table>
  </div>`;
}

function renderReadiness(data: MechanicReportData, t: Translate): string {
  const readiness = data.readiness;
  if (!readiness) {
    return section(t("report.section.readiness"), emptyNote(t("report.readiness.none")));
  }

  const summary = `<p>${escapeHTML(
    t(readiness.milOn ? "report.readiness.milOn" : "report.readiness.milOff")
  )} · ${escapeHTML(
    t("report.readiness.incomplete", { count: readiness.incompleteCount, supported: readiness.supportedCount })
  )} · ${escapeHTML(t("report.readiness.captured", { date: date(readiness.at) }))}</p>`;

  const table = readiness.monitors?.length
    ? `<table class="grid">
        <tr><th>${escapeHTML(t("report.readiness.monitor"))}</th><th>${escapeHTML(t("report.readiness.state"))}</th></tr>
        ${readiness.monitors
          .map(
            (m) => `<tr>
              <td>${escapeHTML(t(`obd.monitor.${m.key}`, { defaultValue: m.key }))}</td>
              <td>${escapeHTML(
                t(
                  !m.supported
                    ? "report.readiness.unsupported"
                    : m.complete
                      ? "report.readiness.complete"
                      : "report.readiness.notComplete"
                )
              )}</td>
            </tr>`
          )
          .join("")}
      </table>`
    : emptyNote(t("report.readiness.noDetail"));

  return section(t("report.section.readiness"), summary + table);
}

function renderHealth(data: MechanicReportData, t: Translate): string {
  const health = data.health;
  if (!health) return "";

  const rows = health.categories
    .map(
      (c) => `<tr>
        <td>${escapeHTML(t(`health.category.${c.category}`))}</td>
        <td>${c.score != null ? escapeHTML(String(c.score)) : "—"}</td>
        <td>${escapeHTML(t(`health.grade.${c.grade}`))}</td>
        <td>${c.evidence.length ? c.evidence.map((e) => escapeHTML(t(e.key, e.params))).join("; ") : "—"}</td>
      </tr>`
    )
    .join("");

  return section(
    t("report.section.health"),
    `<p>${escapeHTML(
      health.overallScore != null
        ? t("report.health.overall", { score: health.overallScore })
        : t("report.health.noOverall")
    )}</p>
     <table class="grid">
       <tr><th>${escapeHTML(t("report.health.system"))}</th>
           <th>${escapeHTML(t("report.health.score"))}</th>
           <th>${escapeHTML(t("report.health.grade"))}</th>
           <th>${escapeHTML(t("report.health.basis"))}</th></tr>
       ${rows}
     </table>`
  );
}

function renderMaintenance(data: MechanicReportData, t: Translate): string {
  if (data.maintenance.length === 0) {
    return section(t("report.section.maintenance"), emptyNote(t("report.maintenance.none")));
  }
  const rows = data.maintenance
    .map(
      (item) => `<tr>
        <td>${escapeHTML(item.customTitle ?? t(item.titleKey, { defaultValue: item.titleKey }))}</td>
        <td>${escapeHTML(t(`report.maintenance.status.${item.due.status}`))}</td>
        <td>${escapeHTML(item.lastDoneKm != null ? `${num(item.lastDoneKm)} km` : "—")}</td>
        <td>${escapeHTML(date(item.lastDoneDate ?? undefined))}</td>
      </tr>`
    )
    .join("");

  return section(
    t("report.section.maintenance"),
    `<table class="grid">
      <tr><th>${escapeHTML(t("report.maintenance.item"))}</th>
          <th>${escapeHTML(t("report.maintenance.state"))}</th>
          <th>${escapeHTML(t("report.maintenance.lastKm"))}</th>
          <th>${escapeHTML(t("report.maintenance.lastDate"))}</th></tr>
      ${rows}
    </table>`
  );
}

function renderDriving(data: MechanicReportData, t: Translate): string {
  const d = data.driving;
  if (d.tripCount === 0 && data.refuels.count === 0) {
    return section(t("report.section.driving"), emptyNote(t("report.driving.none")));
  }
  const rows: Array<[string, string]> = [
    [t("report.driving.trips"), String(d.tripCount)],
    [t("report.driving.distance"), `${num(d.distanceKm, 1)} km`],
    [t("report.driving.fuel"), `${num(d.fuelUsedL, 2)} L`],
    [t("report.driving.idleFuel"), `${num(d.idleFuelL, 2)} L`],
    [t("report.driving.average"), `${num(d.avgL100, 1)} L/100km`],
    [t("report.driving.maxSpeed"), `${num(d.maxSpeedKmh)} km/h`],
    [
      t("report.driving.refuels"),
      `${data.refuels.count} · ${num(data.refuels.litres, 2)} L · ${num(data.refuels.cost, 2)} ${data.currencyCode}`,
    ],
  ];
  return section(
    t("report.section.driving", { days: data.drivingFromDays }),
    `<p class="note small">${escapeHTML(t("report.driving.window", { days: data.drivingFromDays }))}</p>
     <table>${rows.map(([k, v]) => `<tr><th>${escapeHTML(k)}</th><td>${escapeHTML(v)}</td></tr>`).join("")}</table>`
  );
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #14161a; margin: 0; padding: 34px 32px 40px; font-size: 12px; line-height: 1.5; }
  header { border-bottom: 2px solid #1C6FE0; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.2px; }
  .sub { margin: 4px 0 0; color: #5b6068; font-size: 12px; }
  section { margin-bottom: 20px; page-break-inside: avoid; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.6px; color: #1C6FE0; margin: 0 0 8px; }
  h3 { font-size: 12px; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; color: #5b6068; padding: 4px 8px 4px 0; vertical-align: top; width: 34%; }
  td { padding: 4px 8px 4px 0; vertical-align: top; }
  table.grid th { width: auto; border-bottom: 1px solid #d9dde3; color: #14161a; }
  table.grid td { border-bottom: 1px solid #eef0f3; }
  .mono { font-family: "SF Mono", Menlo, Consolas, monospace; }
  .small { font-size: 11px; }
  .empty { color: #8b9199; font-style: italic; margin: 0; }
  .note { color: #5b6068; margin: 8px 0 2px; }
  .frame { margin-top: 10px; padding: 10px 12px; background: #f5f7fa; border-radius: 8px; }
  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d9dde3; color: #8b9199; font-size: 10px; }
`;
