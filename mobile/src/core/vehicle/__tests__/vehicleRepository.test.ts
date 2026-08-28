import { displayedOdometerKm, hasUnassignedHistory, shouldOfferAdoption } from "../vehicleRepository";

describe("displayedOdometerKm", () => {
  it("shows the dashboard reading, not just what the app recorded", () => {
    // User entered 152 000 km when the app had recorded 0.
    expect(displayedOdometerKm({ odometerKm: 0, odometerOffsetKm: 152_000 })).toBe(152_000);
    // After 340 km of recorded trips it must read 152 340, not 340.
    expect(displayedOdometerKm({ odometerKm: 340, odometerOffsetKm: 152_000 })).toBe(152_340);
  });

  it("works with no manual baseline set", () => {
    expect(displayedOdometerKm({ odometerKm: 1234, odometerOffsetKm: 0 })).toBe(1234);
  });

  it("allows a negative offset when the entered reading is behind our tally", () => {
    // Recorded 500 km on a car whose dash reads 300 (trips logged on another car).
    expect(displayedOdometerKm({ odometerKm: 500, odometerOffsetKm: -200 })).toBe(300);
  });
});

describe("shouldOfferAdoption", () => {
  const some = { trips: 12, refuels: 3, codes: 1 };
  const none = { trips: 0, refuels: 0, codes: 0 };
  const seeded = { isSeeded: true };
  const described = { isSeeded: false };

  it("offers on the first car the user describes", () => {
    expect(shouldOfferAdoption([seeded], some)).toBe(true);
  });

  it("offers on a fresh install that somehow has history but no placeholder yet", () => {
    expect(shouldOfferAdoption([], some)).toBe(true);
  });

  it("stays quiet when there is nothing to move", () => {
    expect(shouldOfferAdoption([seeded], none)).toBe(false);
    expect(shouldOfferAdoption([], none)).toBe(false);
  });

  it("does not ask again when adding a second car", () => {
    // The history plainly belongs to the car they already described.
    expect(shouldOfferAdoption([described], some)).toBe(false);
    expect(shouldOfferAdoption([described, seeded], some)).toBe(false);
  });

  it("counts any one kind of record as worth asking about", () => {
    expect(shouldOfferAdoption([seeded], { trips: 0, refuels: 0, codes: 2 })).toBe(true);
    expect(shouldOfferAdoption([seeded], { trips: 1, refuels: 0, codes: 0 })).toBe(true);
  });
});

describe("hasUnassignedHistory", () => {
  it("is false only when every count is zero", () => {
    expect(hasUnassignedHistory({ trips: 0, refuels: 0, codes: 0 })).toBe(false);
    expect(hasUnassignedHistory({ trips: 0, refuels: 1, codes: 0 })).toBe(true);
  });
});
