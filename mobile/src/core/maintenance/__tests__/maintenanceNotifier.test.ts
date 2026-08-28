import { newlyActionable, nextSeen } from "../maintenanceNotifier";
import type { ScheduledMaintenanceItem } from "../../storage/maintenanceRepository";
import type { DueStatus } from "../maintenanceSchedule";

function item(id: string, status: DueStatus, isEnabled = true): ScheduledMaintenanceItem {
  return {
    id,
    titleKey: `maintenance.${id}`,
    customTitle: null,
    intervalKm: 10_000,
    intervalMonths: 12,
    lastDoneKm: 0,
    lastDoneDate: 0,
    lastCost: null,
    note: null,
    isEnabled,
    due: { status, progress: 1 },
  };
}

describe("newlyActionable", () => {
  it("alerts the first time an item falls due", () => {
    expect(newlyActionable([item("oil", "due")], {}).map((i) => i.id)).toEqual(["oil"]);
  });

  it("stays quiet about an item the user has already been told about", () => {
    expect(newlyActionable([item("oil", "due")], { oil: "due" })).toEqual([]);
  });

  it("speaks up again when a due item becomes overdue", () => {
    expect(newlyActionable([item("oil", "overdue")], { oil: "due" }).map((i) => i.id)).toEqual(["oil"]);
  });

  it("does not re-alert when an overdue item is merely recomputed as due", () => {
    expect(newlyActionable([item("oil", "due")], { oil: "overdue" })).toEqual([]);
  });

  it("ignores items that are not yet due, and disabled ones that are", () => {
    const items = [item("plugs", "soon"), item("coolant", "ok"), item("belt", "overdue", false)];
    expect(newlyActionable(items, {})).toEqual([]);
  });

  it("ignores items with no service history to schedule from", () => {
    expect(newlyActionable([item("oil", "unknown")], {})).toEqual([]);
  });
});

describe("nextSeen", () => {
  it("remembers only what is currently due", () => {
    const items = [item("oil", "overdue"), item("plugs", "soon"), item("coolant", "due")];
    expect(nextSeen(items)).toEqual({ oil: "overdue", coolant: "due" });
  });

  it("forgets a serviced item so it can alert again next interval", () => {
    // Was overdue, now freshly serviced and back to ok.
    expect(nextSeen([item("oil", "ok")])).toEqual({});
    expect(newlyActionable([item("oil", "due")], nextSeen([item("oil", "ok")])).map((i) => i.id)).toEqual(["oil"]);
  });
});
