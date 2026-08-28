import { useEffect } from "react";
import { useTripRecorder } from "../trip/tripRecorder";
import { useOBDStore } from "../obd/obdService";
import { useAppSettings } from "../settings/appSettings";
import { useEffectivePricePerLiter } from "../fuel/effectivePrice";
import { Formatters } from "@/design/formatters";
import { tripNotification } from "./tripNotification";

/** Mirrors the active trip into the ongoing notification. The notification
 * module itself dedupes identical updates, so this can follow the live state
 * closely without hammering the notification manager. */
export function useTripNotificationRunner(): void {
  const state = useTripRecorder((s) => s.state);
  const live = useTripRecorder((s) => s.live);
  const fuelLevelPct = useOBDStore((s) => s.snapshot.fuelLevelPct);
  const settings = useAppSettings();
  const pricePerLiter = useEffectivePricePerLiter();

  const active = state.kind === "recording" || state.kind === "paused";
  const enabled = settings.liveTripNotification;

  // Coarse values so the effect runs on meaningful changes, not every snapshot.
  const distanceKey = Math.round(live.distanceKm * 10);
  const costKey = Math.round(live.fuelUsedL * pricePerLiter * 10);
  const fuelKey = fuelLevelPct != null ? Math.round(fuelLevelPct) : -1;

  useEffect(() => {
    if (!active || !enabled) {
      tripNotification.stop().catch(() => undefined);
      return;
    }
    tripNotification
      .show({
        startedAt: live.startedAt ?? Date.now(),
        distanceText: Formatters.distance(live.distanceKm, settings),
        consumptionText:
          live.avgL100 != null ? Formatters.consumption(live.avgL100, settings) : undefined,
        costText: Formatters.currency(live.fuelUsedL * pricePerLiter, settings.currencyCode),
        fuelLevelPct,
        paused: state.kind === "paused",
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, enabled, state.kind, distanceKey, costKey, fuelKey]);

  // Never leave an orphaned foreground service behind an unmount.
  useEffect(() => () => void tripNotification.stop().catch(() => undefined), []);
}
