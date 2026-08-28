import { compareByUrgency, computeDue, isActionable, type DueInfo } from "../maintenanceSchedule";

const NOW = Date.UTC(2026, 0, 15);
const DAY = 86_400_000;
const MONTH = 30.44 * DAY;

const oil = { intervalKm: 10_000, intervalMonths: 12 };

describe("computeDue", () => {
  it("reports unknown when the item has never been recorded as done", () => {
    const info = computeDue({ ...oil, lastDoneKm: null, lastDoneDate: null }, { odometerKm: 90_000, now: NOW });
    expect(info.status).toBe("unknown");
    expect(info.remainingKm).toBeUndefined();
    expect(info.dueAtKm).toBeUndefined();
  });

  it("reports unknown when the item has no interval at all", () => {
    const info = computeDue(
      { intervalKm: null, intervalMonths: null, lastDoneKm: 80_000, lastDoneDate: NOW - MONTH },
      { odometerKm: 90_000, now: NOW }
    );
    expect(info.status).toBe("unknown");
  });

  it("counts distance from the last service, not from zero", () => {
    const info = computeDue(
      { ...oil, lastDoneKm: 152_000, lastDoneDate: NOW - MONTH },
      { odometerKm: 155_500, now: NOW }
    );
    expect(info.dueAtKm).toBe(162_000);
    expect(info.remainingKm).toBe(6_500);
    expect(info.status).toBe("ok");
  });

  it("goes overdue once the odometer passes the due reading", () => {
    const info = computeDue(
      { ...oil, lastDoneKm: 152_000, lastDoneDate: NOW - MONTH },
      { odometerKm: 162_400, now: NOW }
    );
    expect(info.status).toBe("overdue");
    expect(info.remainingKm).toBeLessThan(0);
    expect(info.driver).toBe("distance");
  });

  it("walks through the severity buckets as the odometer climbs", () => {
    const at = (odometerKm: number) =>
      computeDue({ ...oil, lastDoneKm: 100_000, lastDoneDate: NOW - MONTH }, { odometerKm, now: NOW }).status;
    expect(at(100_000)).toBe("ok");
    expect(at(107_000)).toBe("ok");
    expect(at(108_600)).toBe("soon"); // within 15% of a 10 000 km interval
    expect(at(109_700)).toBe("due"); // within 5%
    expect(at(110_100)).toBe("overdue");
  });

  it("caps the early-warning distance so a long interval does not nag for months", () => {
    // 15% of 60 000 km would be 9 000 km; the cap keeps it at 3 000.
    const plugs = { intervalKm: 60_000, intervalMonths: null, lastDoneKm: 0, lastDoneDate: null };
    expect(computeDue(plugs, { odometerKm: 52_000, now: NOW }).status).toBe("ok");
    expect(computeDue(plugs, { odometerKm: 57_500, now: NOW }).status).toBe("soon");
  });

  it("lets time fall due first when the car is barely driven", () => {
    const info = computeDue(
      { ...oil, lastDoneKm: 100_000, lastDoneDate: NOW - 13 * MONTH },
      { odometerKm: 101_200, now: NOW }
    );
    expect(info.status).toBe("overdue");
    expect(info.driver).toBe("time");
    expect(info.remainingDays).toBeLessThan(0);
    // The distance side is still comfortable.
    expect(info.remainingKm).toBeGreaterThan(8_000);
  });

  it("lets distance fall due first on a car that covers ground fast", () => {
    const info = computeDue(
      { ...oil, lastDoneKm: 100_000, lastDoneDate: NOW - 2 * MONTH },
      { odometerKm: 110_500, now: NOW }
    );
    expect(info.status).toBe("overdue");
    expect(info.driver).toBe("distance");
  });

  it("warns two weeks out on a time-only item", () => {
    const brakeFluid = { intervalKm: null, intervalMonths: 24, lastDoneKm: null };
    const at = (offsetDays: number) =>
      computeDue({ ...brakeFluid, lastDoneDate: NOW - 24 * MONTH + offsetDays * DAY }, { odometerKm: 0, now: NOW })
        .status;
    expect(at(60)).toBe("ok");
    expect(at(30)).toBe("soon");
    expect(at(7)).toBe("due");
    expect(at(-1)).toBe("overdue");
  });

  it("clamps progress to the interval so the bar never overflows", () => {
    const info = computeDue(
      { ...oil, lastDoneKm: 100_000, lastDoneDate: NOW - 40 * MONTH },
      { odometerKm: 200_000, now: NOW }
    );
    expect(info.progress).toBe(1);
    expect(info.progress).toBeGreaterThanOrEqual(0);
  });

  it("takes progress from whichever limit is further along", () => {
    // Half the distance used, a tenth of the time.
    const info = computeDue(
      { ...oil, lastDoneKm: 100_000, lastDoneDate: NOW - 1.2 * MONTH },
      { odometerKm: 105_000, now: NOW }
    );
    expect(info.progress).toBeCloseTo(0.5, 2);
  });
});

describe("ordering and flags", () => {
  it("treats only due and overdue as needing action", () => {
    expect(isActionable("overdue")).toBe(true);
    expect(isActionable("due")).toBe(true);
    expect(isActionable("soon")).toBe(false);
    expect(isActionable("unknown")).toBe(false);
  });

  it("floats the most urgent items to the top and unknowns to the bottom", () => {
    const info = (status: DueInfo["status"], progress = 0): DueInfo => ({ status, progress });
    const sorted = [info("ok"), info("unknown"), info("overdue"), info("soon"), info("due")]
      .sort(compareByUrgency)
      .map((i) => i.status);
    expect(sorted).toEqual(["overdue", "due", "soon", "ok", "unknown"]);
  });

  it("breaks ties on how far through the interval each item is", () => {
    const sorted = [
      { status: "soon" as const, progress: 0.86 },
      { status: "soon" as const, progress: 0.93 },
    ].sort(compareByUrgency);
    expect(sorted[0]!.progress).toBe(0.93);
  });
});
