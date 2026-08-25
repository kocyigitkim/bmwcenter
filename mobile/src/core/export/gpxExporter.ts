import { File, Paths } from "expo-file-system";
import type { Trip } from "../storage/models";

export async function exportTripGPX(trip: Trip): Promise<string | undefined> {
  const coords = trip.routeData ?? [];
  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="QuickCar" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>${trip.id}</name><trkseg>\n`;
  coords.forEach((c) => {
    const t = new Date(c.t ?? trip.startedAt).toISOString();
    gpx += `<trkpt lat="${c.lat}" lon="${c.lon}"><time>${t}</time></trkpt>\n`;
  });
  gpx += "</trkseg></trk></gpx>";
  try {
    const file = new File(Paths.cache, `trip-${trip.id}.gpx`);
    file.create();
    file.write(gpx);
    return file.uri;
  } catch {
    return undefined;
  }
}
