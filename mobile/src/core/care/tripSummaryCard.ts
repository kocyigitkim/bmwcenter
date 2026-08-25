import type { Trip } from "../storage/models";

export interface TripSummaryCardModel {
  vehicleName: string;
  date: number;
  distanceKm: number;
  durationS: number;
  avgL100: number;
  cost: number;
  currencyCode: string;
  score: number | null;
  cleanWarmup: boolean;
  harshBrakes: number;
  hideLocation: boolean;
}

/** Matches TripSummaryCardRenderer.shouldRender — only worth showing for a real drive. */
export function shouldRenderTripCard(distanceKm: number): boolean {
  return distanceKm >= 2;
}

export function buildTripSummaryCard(
  trip: Trip,
  vehicleName: string,
  pricePerLiter: number,
  currencyCode: string,
  cleanWarmup: boolean,
  hideLocation: boolean
): TripSummaryCardModel {
  const harsh = (trip.events ?? []).filter((e) => e.type === "harshBrake").length;
  return {
    vehicleName,
    date: trip.endedAt ?? trip.startedAt,
    distanceKm: trip.distanceKm,
    durationS: trip.durationS,
    avgL100: trip.avgL100,
    cost: trip.fuelUsedL * pricePerLiter,
    currencyCode,
    score: trip.scoreTotal,
    cleanWarmup,
    harshBrakes: harsh,
    hideLocation,
  };
}
