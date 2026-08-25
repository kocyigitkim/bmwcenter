import * as Print from "expo-print";
import { summarize, emptyDrivingSummary } from "../storage/models";
import type { Trip } from "../storage/models";

export async function buildMonthlyReportPDF(
  trips: Trip[],
  pricePerLiter: number,
  vehicleName: string
): Promise<string | undefined> {
  const summary = trips.length ? summarize(trips, pricePerLiter) : emptyDrivingSummary();
  const html = `
    <html>
      <body style="font-family: -apple-system, Helvetica, sans-serif; padding: 40px;">
        <h1 style="font-size: 20px;">QuickCar — ${vehicleName || "Vehicle"}</h1>
        <p style="font-size: 13px; line-height: 1.8;">
          Trips: ${summary.tripCount}<br/>
          Distance: ${summary.distanceKm.toFixed(1)} km<br/>
          Fuel: ${summary.fuelUsedL.toFixed(2)} L<br/>
          Avg: ${summary.avgL100.toFixed(1)} L/100km<br/>
          Cost: ${summary.estimatedCost.toFixed(2)}<br/>
          Score: ${summary.avgScore != null ? summary.avgScore.toFixed(0) : "—"}
        </p>
        <p style="font-size: 10px; color: #888;">QuickCar</p>
      </body>
    </html>
  `;
  try {
    const { uri } = await Print.printToFileAsync({ html });
    return uri;
  } catch {
    return undefined;
  }
}
