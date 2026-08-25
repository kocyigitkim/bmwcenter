import type { SemanticColor } from "./tokens";

export interface GaugeZone {
  from: number;
  to: number;
  semantic: SemanticColor;
}

export function contains(zone: GaugeZone, value: number): boolean {
  return value >= zone.from && value <= zone.to;
}

export function semanticFor(value: number, zones: GaugeZone[]): SemanticColor {
  return zones.find((z) => contains(z, value))?.semantic ?? "nominal";
}

export function speedZones(max = 220): GaugeZone[] {
  return [
    { from: 0, to: 140, semantic: "nominal" },
    { from: 140, to: 180, semantic: "attention" },
    { from: 180, to: max, semantic: "critical" },
  ];
}

export function rpmZones(max = 7000): GaugeZone[] {
  return [
    { from: 0, to: 5500, semantic: "nominal" },
    { from: 5500, to: 6500, semantic: "attention" },
    { from: 6500, to: max, semantic: "critical" },
  ];
}

export function coolantZones(celsius: boolean): GaugeZone[] {
  if (celsius) {
    return [
      { from: 0, to: 70, semantic: "cold" },
      { from: 70, to: 105, semantic: "nominal" },
      { from: 105, to: 110, semantic: "attention" },
      { from: 110, to: 160, semantic: "critical" },
    ];
  }
  return [
    { from: 32, to: 158, semantic: "cold" },
    { from: 158, to: 221, semantic: "nominal" },
    { from: 221, to: 230, semantic: "attention" },
    { from: 230, to: 320, semantic: "critical" },
  ];
}

export function fuelZones(): GaugeZone[] {
  return [
    { from: 0, to: 8, semantic: "critical" },
    { from: 8, to: 15, semantic: "attention" },
    { from: 15, to: 100, semantic: "nominal" },
  ];
}

export function percentZones(): GaugeZone[] {
  return [{ from: 0, to: 100, semantic: "nominal" }];
}

export function voltageZones(): GaugeZone[] {
  return [
    { from: 0, to: 11.5, semantic: "critical" },
    { from: 11.5, to: 12.2, semantic: "attention" },
    { from: 12.2, to: 15.5, semantic: "nominal" },
    { from: 15.5, to: 18, semantic: "attention" },
  ];
}
