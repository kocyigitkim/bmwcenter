import { escapeHTML, renderMechanicReportHTML, type MechanicReportData } from "../mechanicReport";
import { emptyDrivingSummary } from "../../storage/models";
import type { ScheduledMaintenanceItem } from "../../storage/maintenanceRepository";

const NOW = Date.UTC(2026, 1, 3);

/** Keys pass through so assertions read against the section they came from. */
const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${Object.values(options).join(",")})` : key;

function data(over: Partial<MechanicReportData> = {}): MechanicReportData {
  return {
    generatedAt: NOW,
    vehicle: { name: "BMW 320i", vin: "WBA8E9105GK123456", fuelType: "gasoline", odometerKm: 152_340 },
    codes: [],
    clearedCodes: [],
    maintenance: [],
    driving: emptyDrivingSummary(),
    drivingFromDays: 90,
    refuels: { count: 0, litres: 0, cost: 0 },
    currencyCode: "TRY",
    ...over,
  };
}

function maintenanceItem(over: Partial<ScheduledMaintenanceItem> = {}): ScheduledMaintenanceItem {
  return {
    id: "oil",
    titleKey: "maintenance.oilChange",
    customTitle: null,
    intervalKm: 10_000,
    intervalMonths: 12,
    lastDoneKm: 140_000,
    lastDoneDate: NOW - 400 * 86_400_000,
    lastCost: null,
    note: null,
    isEnabled: true,
    due: { status: "overdue", progress: 1, remainingKm: -2340, driver: "distance" },
    ...over,
  };
}

describe("escapeHTML", () => {
  it("neutralises markup from anything a user or catalogue supplied", () => {
    expect(escapeHTML('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
    );
    expect(escapeHTML("Bob's & Sons")).toBe("Bob&#39;s &amp; Sons");
  });

  it("renders absent values as empty rather than the word undefined", () => {
    expect(escapeHTML(undefined)).toBe("");
    expect(escapeHTML(null)).toBe("");
  });
});

describe("renderMechanicReportHTML", () => {
  it("puts the vehicle identity on the page", () => {
    const html = renderMechanicReportHTML(data(), t);
    expect(html).toContain("BMW 320i");
    expect(html).toContain("WBA8E9105GK123456");
    expect(html).toContain("152340");
  });

  it("escapes a vehicle name that contains markup", () => {
    const html = renderMechanicReportHTML(
      data({ vehicle: { name: "<b>x</b>", fuelType: "diesel", odometerKm: 0 } }),
      t
    );
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("says so plainly when there are no codes rather than showing an empty table", () => {
    const html = renderMechanicReportHTML(data(), t);
    expect(html).toContain("report.codes.none");
  });

  it("lists each code with its status and description", () => {
    const html = renderMechanicReportHTML(
      data({
        codes: [
          { code: "P0420", status: "permanent", seenAt: NOW, description: "Catalyst below threshold" },
          { code: "P0171", status: "pending", seenAt: NOW },
        ],
      }),
      t
    );
    expect(html).toContain("P0420");
    expect(html).toContain("Catalyst below threshold");
    expect(html).toContain("dtc.status.permanent");
    expect(html).toContain("dtc.status.pending");
  });

  it("prints the freeze frame captured with a code", () => {
    const html = renderMechanicReportHTML(
      data({
        codes: [
          {
            code: "P0301",
            status: "stored",
            seenAt: NOW,
            freezeFrame: { triggerCode: "P0301", rpm: 2450, coolantC: 88, speedKmh: 64 },
          },
        ],
      }),
      t
    );
    expect(html).toContain("2450");
    expect(html).toContain("88 °C");
    expect(html).toContain("64 km/h");
  });

  it("flags a freeze frame that belongs to a different code", () => {
    const html = renderMechanicReportHTML(
      data({
        codes: [
          { code: "P0171", status: "stored", seenAt: NOW, freezeFrame: { triggerCode: "P0301", rpm: 900 } },
        ],
      }),
      t
    );
    expect(html).toContain("report.freezeFrame.mismatch(P0301)");
  });

  it("omits a freeze frame block that carries no readings", () => {
    const html = renderMechanicReportHTML(
      data({ codes: [{ code: "P0171", status: "stored", seenAt: NOW, freezeFrame: { triggerCode: "P0171" } }] }),
      t
    );
    expect(html).not.toContain("report.freezeFrame.title");
  });

  it("records codes that were cleared, because a returning code is the useful part", () => {
    const html = renderMechanicReportHTML(
      data({ clearedCodes: [{ code: "P0128", status: "stored", seenAt: Date.UTC(2025, 10, 2) }] }),
      t
    );
    expect(html).toContain("report.codes.clearedIntro");
    expect(html).toContain("P0128 (2025-11-02)");
  });

  it("prints the readiness monitor table when the detail was captured", () => {
    const html = renderMechanicReportHTML(
      data({
        readiness: {
          incompleteCount: 1,
          supportedCount: 5,
          milOn: false,
          at: NOW,
          monitors: [
            { key: "catalyst", supported: true, complete: true },
            { key: "evap", supported: true, complete: false },
            { key: "egr", supported: false, complete: false },
          ],
        },
      }),
      t
    );
    expect(html).toContain("report.readiness.complete");
    expect(html).toContain("report.readiness.notComplete");
    expect(html).toContain("report.readiness.unsupported");
    expect(html).toContain("report.readiness.milOff");
  });

  it("admits when no scan has ever been run instead of implying the car is ready", () => {
    const html = renderMechanicReportHTML(data(), t);
    expect(html).toContain("report.readiness.none");
    expect(html).not.toContain("report.readiness.monitor");
  });

  it("falls back to a note when readiness was stored before per-monitor detail existed", () => {
    const html = renderMechanicReportHTML(
      data({ readiness: { incompleteCount: 0, supportedCount: 7, milOn: true, at: NOW } }),
      t
    );
    expect(html).toContain("report.readiness.noDetail");
    expect(html).toContain("report.readiness.milOn");
  });

  it("carries the health grade and the evidence behind it", () => {
    const html = renderMechanicReportHTML(
      data({
        health: {
          overallScore: 72,
          overallGrade: "watch",
          unknownCount: 1,
          categories: [
            {
              category: "cooling",
              grade: "attention",
              score: 45,
              confidence: "high",
              evidence: [{ key: "health.evidence.event.overheat", params: { count: 3 }, weight: 25 }],
            },
            { category: "transmission", grade: "unknown", confidence: "low", evidence: [] },
          ],
        },
      }),
      t
    );
    expect(html).toContain("report.health.overall(72)");
    expect(html).toContain("health.category.cooling");
    expect(html).toContain("health.evidence.event.overheat(3)");
    expect(html).toContain("health.grade.unknown");
  });

  it("leaves the health section out entirely when it could not be computed", () => {
    const html = renderMechanicReportHTML(data({ health: undefined }), t);
    expect(html).not.toContain("report.section.health");
  });

  it("lists maintenance with its state and last service", () => {
    const html = renderMechanicReportHTML(data({ maintenance: [maintenanceItem()] }), t);
    expect(html).toContain("report.maintenance.status.overdue");
    expect(html).toContain("140000 km");
  });

  it("shows a dash for a maintenance item never serviced", () => {
    const html = renderMechanicReportHTML(
      data({
        maintenance: [
          maintenanceItem({ lastDoneKm: null, lastDoneDate: null, due: { status: "unknown", progress: 0 } }),
        ],
      }),
      t
    );
    expect(html).toContain("report.maintenance.status.unknown");
  });

  it("summarises recent driving and refuelling", () => {
    const html = renderMechanicReportHTML(
      data({
        driving: { ...emptyDrivingSummary(), tripCount: 12, distanceKm: 843.2, fuelUsedL: 61.4, avgL100: 7.3 },
        refuels: { count: 2, litres: 78.5, cost: 3140.5 },
      }),
      t
    );
    expect(html).toContain("843.2 km");
    expect(html).toContain("61.40 L");
    expect(html).toContain("7.3 L/100km");
    expect(html).toContain("78.50 L");
    expect(html).toContain("TRY");
  });

  it("says there is no driving history rather than printing a table of zeroes", () => {
    const html = renderMechanicReportHTML(data(), t);
    expect(html).toContain("report.driving.none");
  });

  it("produces a complete document", () => {
    const html = renderMechanicReportHTML(data(), t);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });
});
