/**
 * The mileage log as a document to hand an employer or an accountant.
 *
 * Rendering is separate from collection, as with the mechanic report, so the
 * layout is testable and so the page can be explicit about what its numbers
 * are: fuel cost derived from measured consumption, and — only if the user
 * supplied a rate — an allowance figure, clearly labelled as theirs rather
 * than ours.
 */

import * as Print from "expo-print";
import { escapeHTML } from "../export/mechanicReport";
import {
  allowanceFor,
  categoryOf,
  summarise,
  type MileageSummary,
  type MileageTrip,
} from "./mileageLog";

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface MileageReportData {
  generatedAt: number;
  vehicleName: string;
  periodLabel: string;
  trips: MileageTrip[];
  summary: MileageSummary;
  currencyCode: string;
  pricePerLiter: number;
  /** Per-kilometre reimbursement rate, when the user has set one. */
  ratePerKm?: number;
}

export function buildMileageReportData(input: {
  now: number;
  vehicleName: string;
  periodLabel: string;
  trips: MileageTrip[];
  from: number;
  to: number;
  pricePerLiter: number;
  currencyCode: string;
  ratePerKm?: number;
}): MileageReportData {
  return {
    generatedAt: input.now,
    vehicleName: input.vehicleName,
    periodLabel: input.periodLabel,
    trips: input.trips,
    summary: summarise(input.trips, input.pricePerLiter, input.from, input.to),
    currencyCode: input.currencyCode,
    pricePerLiter: input.pricePerLiter,
    ratePerKm: input.ratePerKm,
  };
}

function money(value: number, code: string): string {
  return `${value.toFixed(2)} ${code}`;
}

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function time(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function renderMileageReportHTML(data: MileageReportData, t: Translate): string {
  const business = data.summary.byCategory.find((c) => c.category === "business")!;
  const allowance = data.ratePerKm ? allowanceFor(business.distanceKm, data.ratePerKm) : undefined;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>${STYLE}</style></head>
<body>
  <header>
    <h1>${escapeHTML(t("mileage.report.title"))}</h1>
    <p class="sub">${escapeHTML(data.vehicleName)} · ${escapeHTML(data.periodLabel)}</p>
  </header>

  <section>
    <h2>${escapeHTML(t("mileage.report.summary"))}</h2>
    <table class="grid">
      <tr>
        <th>${escapeHTML(t("mileage.report.category"))}</th>
        <th class="num">${escapeHTML(t("mileage.report.trips"))}</th>
        <th class="num">${escapeHTML(t("mileage.report.distance"))}</th>
        <th class="num">${escapeHTML(t("mileage.report.fuel"))}</th>
        <th class="num">${escapeHTML(t("mileage.report.cost"))}</th>
      </tr>
      ${data.summary.byCategory
        .filter((c) => c.tripCount > 0)
        .map(
          (c) => `<tr>
            <td>${escapeHTML(t(`mileage.category.${c.category}`))}</td>
            <td class="num">${c.tripCount}</td>
            <td class="num">${c.distanceKm.toFixed(1)} km</td>
            <td class="num">${c.fuelUsedL.toFixed(2)} L</td>
            <td class="num">${escapeHTML(money(c.fuelCost, data.currencyCode))}</td>
          </tr>`
        )
        .join("")}
      <tr class="total">
        <td>${escapeHTML(t("mileage.report.total"))}</td>
        <td class="num">${data.summary.byCategory.reduce((s, c) => s + c.tripCount, 0)}</td>
        <td class="num">${data.summary.totalDistanceKm.toFixed(1)} km</td>
        <td class="num"></td>
        <td class="num">${escapeHTML(money(data.summary.totalFuelCost, data.currencyCode))}</td>
      </tr>
    </table>

    ${
      allowance != null
        ? `<p class="note">${escapeHTML(
            t("mileage.report.allowance", {
              distance: `${business.distanceKm.toFixed(1)} km`,
              rate: money(data.ratePerKm!, data.currencyCode),
              total: money(allowance, data.currencyCode),
            })
          )}</p>`
        : ""
    }
  </section>

  <section>
    <h2>${escapeHTML(t("mileage.report.businessTrips"))}</h2>
    ${renderTripTable(data, t)}
  </section>

  <footer>${escapeHTML(t("mileage.report.footer", { price: money(data.pricePerLiter, data.currencyCode) }))}</footer>
</body></html>`;
}

function renderTripTable(data: MileageReportData, t: Translate): string {
  const business = data.trips
    .filter((trip) => categoryOf(trip) === "business")
    .sort((a, b) => a.startedAt - b.startedAt);

  if (business.length === 0) {
    return `<p class="empty">${escapeHTML(t("mileage.report.noBusiness"))}</p>`;
  }

  return `<table class="grid">
    <tr>
      <th>${escapeHTML(t("mileage.report.date"))}</th>
      <th>${escapeHTML(t("mileage.report.route"))}</th>
      <th class="num">${escapeHTML(t("mileage.report.distance"))}</th>
      <th class="num">${escapeHTML(t("mileage.report.cost"))}</th>
    </tr>
    ${business
      .map((trip) => {
        const route = [trip.startPlaceName, trip.endPlaceName].filter(Boolean).join(" → ");
        return `<tr>
          <td>${escapeHTML(day(trip.startedAt))} <span class="dim">${escapeHTML(time(trip.startedAt))}</span></td>
          <td>${escapeHTML(route || t("mileage.report.noRoute"))}${
            trip.note ? `<div class="dim">${escapeHTML(trip.note)}</div>` : ""
          }</td>
          <td class="num">${trip.distanceKm.toFixed(1)} km</td>
          <td class="num">${escapeHTML(money(trip.fuelUsedL * data.pricePerLiter, data.currencyCode))}</td>
        </tr>`;
      })
      .join("")}
  </table>`;
}

export async function buildMileageReportPDF(
  data: MileageReportData,
  t: Translate
): Promise<string | undefined> {
  try {
    const { uri } = await Print.printToFileAsync({ html: renderMileageReportHTML(data, t) });
    return uri;
  } catch {
    return undefined;
  }
}

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #14161a; margin: 0; padding: 34px 32px 40px; font-size: 12px; line-height: 1.5; }
  header { border-bottom: 2px solid #1C6FE0; padding-bottom: 10px; margin-bottom: 18px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.2px; }
  .sub { margin: 4px 0 0; color: #5b6068; font-size: 12px; }
  section { margin-bottom: 22px; page-break-inside: avoid; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.6px; color: #1C6FE0; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-weight: 600; padding: 5px 8px 5px 0; border-bottom: 1px solid #d9dde3; }
  td { padding: 5px 8px 5px 0; vertical-align: top; border-bottom: 1px solid #eef0f3; }
  .num { text-align: right; white-space: nowrap; }
  .total td { font-weight: 700; border-top: 1px solid #d9dde3; border-bottom: none; }
  .dim { color: #8b9199; font-size: 11px; }
  .note { margin: 10px 0 0; padding: 8px 10px; background: #f5f7fa; border-radius: 6px; color: #14161a; }
  .empty { color: #8b9199; font-style: italic; margin: 0; }
  footer { margin-top: 26px; padding-top: 10px; border-top: 1px solid #d9dde3; color: #8b9199; font-size: 10px; }
`;
