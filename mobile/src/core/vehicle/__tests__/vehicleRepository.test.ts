import { displayedOdometerKm } from "../vehicleRepository";

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
