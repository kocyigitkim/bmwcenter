import { File, Paths } from "expo-file-system";
import type { Trip } from "../storage/models";

const TRIP_HEADER =
  "id,started_at,ended_at,distance_km,duration_s,moving_s,idle_s,fuel_l,idle_fuel_l,avg_l_100km,avg_speed_kmh,max_speed_kmh,max_rpm,score,category,start_place,end_place,data_source";

function posix(value: number): string {
  return value.toFixed(6);
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function exportTripsCSV(trips: Trip[]): Promise<string | undefined> {
  const rows = [TRIP_HEADER];
  for (const t of trips) {
    const ended = t.endedAt ? new Date(t.endedAt).toISOString() : "";
    const fields = [
      t.id,
      new Date(t.startedAt).toISOString(),
      ended,
      posix(t.distanceKm),
      posix(t.durationS),
      posix(t.movingDurationS),
      posix(t.idleDurationS),
      posix(t.fuelUsedL),
      posix(t.idleFuelL),
      posix(t.avgL100),
      posix(t.avgSpeedKmh),
      posix(t.maxSpeedKmh),
      posix(t.maxRpm),
      t.scoreTotal != null ? posix(t.scoreTotal) : "",
      quote(t.category),
      quote(t.startPlaceName ?? ""),
      quote(t.endPlaceName ?? ""),
      quote(t.dataSource),
    ];
    rows.push(fields.join(","));
  }
  try {
    const file = new File(Paths.cache, `trips-${Date.now()}.csv`);
    file.create();
    file.write(rows.join("\n"));
    return file.uri;
  } catch {
    return undefined;
  }
}
