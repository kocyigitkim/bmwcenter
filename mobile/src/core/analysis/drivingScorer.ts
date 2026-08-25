export interface ScoreBreakdown {
  acceleration: number;
  braking: number;
  cornering: number;
  speed: number;
  idle: number;
  efficiency: number;
}

export function scoreTotal(b: ScoreBreakdown): number {
  return Math.max(0, Math.min(100, b.acceleration + b.braking + b.cornering + b.speed + b.idle + b.efficiency));
}

export type DetectedEventKind = "harshAccel" | "harshBrake" | "harshCorner";
export interface DetectedEvent {
  kind: DetectedEventKind;
  t: number;
  severity: "normal" | "severe";
  speedKmh: number;
  magnitude: number;
}

export function score(params: {
  distanceKm: number;
  events: DetectedEvent[];
  overspeedDurationRatio: number;
  idleRatio: number;
  avgL100?: number;
  baselineL100?: number;
}): ScoreBreakdown {
  const dist = Math.max(params.distanceKm, 1);
  const density = (kind: DetectedEventKind) => {
    const count = params.events
      .filter((e) => e.kind === kind)
      .reduce((sum, e) => sum + (e.severity === "severe" ? 2.0 : 1.0), 0);
    return (count / dist) * 100;
  };

  const b: ScoreBreakdown = {
    acceleration: Math.max(0, 25 - Math.min(25, density("harshAccel") * 2.5)),
    braking: Math.max(0, 25 - Math.min(25, density("harshBrake") * 3.0)),
    cornering: Math.max(0, 10 - Math.min(10, density("harshCorner") * 2.0)),
    speed: Math.max(0, 15 - Math.min(15, params.overspeedDurationRatio * 60)),
    idle: Math.max(0, 10 - Math.min(10, Math.max(0, params.idleRatio - 0.1) * 50)),
    efficiency: 15,
  };
  const baseline = params.baselineL100 ?? 7.5;
  if (params.avgL100 != null && baseline > 0) {
    b.efficiency = Math.max(0, 15 - Math.min(15, Math.max(0, params.avgL100 / baseline - 1.0) * 40));
  }
  return b;
}
