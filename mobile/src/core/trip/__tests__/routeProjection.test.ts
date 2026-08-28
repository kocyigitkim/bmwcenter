import { projectRoute } from "../routeProjection";

const W = 300;
const H = 200;
const P = 18;

describe("projectRoute", () => {
  it("returns undefined when there is nothing to draw", () => {
    expect(projectRoute([], W, H, P)).toBeUndefined();
    expect(projectRoute([{ lat: 41, lon: 29 }], W, H, P)).toBeUndefined();
    // A stationary track has zero span on both axes.
    expect(
      projectRoute([{ lat: 41, lon: 29 }, { lat: 41, lon: 29 }], W, H, P)
    ).toBeUndefined();
    // Box smaller than its own padding.
    expect(projectRoute([{ lat: 41, lon: 29 }, { lat: 42, lon: 30 }], 10, 10, P)).toBeUndefined();
  });

  it("keeps every point inside the padded box", () => {
    const route = [
      { lat: 41.0, lon: 29.0 },
      { lat: 41.05, lon: 29.08 },
      { lat: 41.02, lon: 29.12 },
      { lat: 41.09, lon: 29.03 },
    ];
    const p = projectRoute(route, W, H, P)!;
    for (const pt of p.points) {
      expect(pt.x).toBeGreaterThanOrEqual(P - 1e-6);
      expect(pt.x).toBeLessThanOrEqual(W - P + 1e-6);
      expect(pt.y).toBeGreaterThanOrEqual(P - 1e-6);
      expect(pt.y).toBeLessThanOrEqual(H - P + 1e-6);
    }
  });

  it("puts north at the top", () => {
    const p = projectRoute([{ lat: 41.0, lon: 29.0 }, { lat: 41.1, lon: 29.0 }], W, H, P)!;
    // Second point is further north, so it must sit higher on screen.
    expect(p.end.y).toBeLessThan(p.start.y);
  });

  it("corrects longitude for latitude so a square track is not stretched", () => {
    // At 60°N a degree of longitude spans half a degree of latitude, so a track
    // 0.2° wide by 0.1° tall is actually square on the ground.
    const p = projectRoute(
      [
        { lat: 60.0, lon: 10.0 },
        { lat: 60.0, lon: 10.2 },
        { lat: 60.1, lon: 10.2 },
        { lat: 60.1, lon: 10.0 },
      ],
      W,
      H,
      P
    )!;
    const xs = p.points.map((q) => q.x);
    const ys = p.points.map((q) => q.y);
    const drawnW = Math.max(...xs) - Math.min(...xs);
    const drawnH = Math.max(...ys) - Math.min(...ys);
    expect(drawnW / drawnH).toBeCloseTo(1, 1);
  });

  it("handles a track that only moves along one axis", () => {
    const eastWest = projectRoute(
      [{ lat: 41, lon: 29.0 }, { lat: 41, lon: 29.2 }],
      W,
      H,
      P
    )!;
    expect(eastWest.points).toHaveLength(2);
    expect(eastWest.start.y).toBeCloseTo(eastWest.end.y);
    expect(eastWest.end.x).toBeGreaterThan(eastWest.start.x);

    const northSouth = projectRoute(
      [{ lat: 41.0, lon: 29 }, { lat: 41.2, lon: 29 }],
      W,
      H,
      P
    )!;
    expect(northSouth.start.x).toBeCloseTo(northSouth.end.x);
  });

  it("centres the track in the box", () => {
    // A wide, flat track fills the width and should sit vertically centred.
    const p = projectRoute(
      [{ lat: 41.0, lon: 29.0 }, { lat: 41.001, lon: 29.4 }],
      W,
      H,
      P
    )!;
    const ys = p.points.map((q) => q.y);
    const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(mid).toBeCloseTo(H / 2, 0);
  });
});
