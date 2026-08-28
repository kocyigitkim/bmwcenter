export interface RoutePoint {
  lat: number;
  lon: number;
}

export interface ProjectedRoute {
  points: Array<{ x: number; y: number }>;
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/**
 * Fits a recorded track into a box, preserving its shape.
 *
 * Equirectangular projection with a cosine correction at the route's mean
 * latitude: a degree of longitude is shorter than a degree of latitude
 * everywhere but the equator, so without it a track drawn at, say, 41°N comes
 * out stretched east-west by about 25%.
 *
 * Returns undefined when there is nothing meaningful to draw — fewer than two
 * points, a degenerate box, or a track that never moves.
 */
export function projectRoute(
  route: RoutePoint[],
  width: number,
  height: number,
  padding: number
): ProjectedRoute | undefined {
  const boxW = width - padding * 2;
  const boxH = height - padding * 2;
  if (route.length < 2 || boxW <= 0 || boxH <= 0) return undefined;

  const meanLat = route.reduce((sum, p) => sum + p.lat, 0) / route.length;
  const kx = Math.cos((meanLat * Math.PI) / 180);
  // y is negated because latitude grows north while screen y grows downward.
  const pts = route.map((p) => ({ x: p.lon * kx, y: -p.lat }));

  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;

  // A perfectly straight north-south or east-west track has zero span on one
  // axis; scale by the other rather than dividing by zero.
  const scale = Math.min(
    spanX > 0 ? boxW / spanX : Number.POSITIVE_INFINITY,
    spanY > 0 ? boxH / spanY : Number.POSITIVE_INFINITY
  );
  if (!Number.isFinite(scale) || scale <= 0) return undefined;

  const offsetX = padding + (boxW - spanX * scale) / 2;
  const offsetY = padding + (boxH - spanY * scale) / 2;
  const points = pts.map((p) => ({
    x: offsetX + (p.x - minX) * scale,
    y: offsetY + (p.y - minY) * scale,
  }));

  return { points, start: points[0]!, end: points[points.length - 1]! };
}
