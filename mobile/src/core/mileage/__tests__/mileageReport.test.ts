import { buildMileageReportData, renderMileageReportHTML } from "../mileageReport";
import type { MileageTrip } from "../mileageLog";

const NOW = Date.UTC(2026, 6, 1);
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${Object.values(options).join(",")})` : key;

let counter = 0;
function trip(over: Partial<MileageTrip> = {}): MileageTrip {
  counter += 1;
  return {
    id: `t${counter}`,
    startedAt: new Date(2026, 5, 10, 9, 5).getTime(),
    endedAt: new Date(2026, 5, 10, 9, 35).getTime(),
    distanceKm: 20,
    fuelUsedL: 1.6,
    category: "business",
    startPlaceName: null,
    endPlaceName: null,
    note: null,
    ...over,
  };
}

function data(trips: MileageTrip[], ratePerKm?: number) {
  return buildMileageReportData({
    now: NOW,
    vehicleName: "BMW 320i",
    periodLabel: "Haziran 2026",
    trips,
    from: new Date(2026, 5, 1).getTime(),
    to: new Date(2026, 6, 1).getTime(),
    pricePerLiter: 45,
    currencyCode: "TRY",
    ratePerKm,
  });
}

describe("renderMileageReportHTML", () => {
  it("names the vehicle and period, and totals the distance", () => {
    const html = renderMileageReportHTML(data([trip({ distanceKm: 120 })]), t);
    expect(html).toContain("BMW 320i");
    expect(html).toContain("Haziran 2026");
    expect(html).toContain("120.0 km");
  });

  it("lists only the business trips in the detail table", () => {
    const html = renderMileageReportHTML(
      data([
        trip({ category: "business", startPlaceName: "Ofis", endPlaceName: "Müşteri" }),
        trip({ category: "personal", startPlaceName: "GİZLİ-ÖZEL" }),
      ]),
      t
    );
    expect(html).toContain("Ofis → Müşteri");
    // A personal drive has no place on an expense claim.
    expect(html).not.toContain("GİZLİ-ÖZEL");
  });

  it("says so when there were no business trips", () => {
    const html = renderMileageReportHTML(data([trip({ category: "personal" })]), t);
    expect(html).toContain("mileage.report.noBusiness");
  });

  it("omits categories with nothing in them from the summary", () => {
    const html = renderMileageReportHTML(data([trip({ category: "business" })]), t);
    expect(html).toContain("mileage.category.business");
    expect(html).not.toContain("mileage.category.other");
  });

  it("shows an allowance only when the user supplied a rate", () => {
    expect(renderMileageReportHTML(data([trip()]), t)).not.toContain("mileage.report.allowance");
    const withRate = renderMileageReportHTML(data([trip({ distanceKm: 100 })], 7.5), t);
    expect(withRate).toContain("mileage.report.allowance");
    expect(withRate).toContain("750.00 TRY");
  });

  it("escapes place names and notes", () => {
    const html = renderMileageReportHTML(
      data([trip({ startPlaceName: "<b>x</b>", note: "a & b" })]),
      t
    );
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("a &amp; b");
  });

  it("falls back to a label when a trip has no recorded places", () => {
    const html = renderMileageReportHTML(data([trip()]), t);
    expect(html).toContain("mileage.report.noRoute");
  });

  it("produces a complete document", () => {
    const html = renderMileageReportHTML(data([trip()]), t);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});
