import { useEffect, useState } from "react";
import { tripRepository, type DateInterval } from "@/core/storage/tripRepository";
import { emptyDrivingSummary, type DrivingSummary } from "@/core/storage/models";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";

export type SummaryPeriod = "today" | "week" | "month" | "all";

function rangeFor(period: SummaryPeriod): DateInterval {
  const now = Date.now();
  switch (period) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { start: start.getTime(), end: start.getTime() + 86400_000 };
    }
    case "week":
      return { start: now - 7 * 86400_000, end: now };
    case "month": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { start: start.getTime(), end: now };
    }
    case "all":
      return { start: 0, end: now };
  }
}

/** Re-fetches on a light interval so dashboard cards stay fresh as trips are recorded. */
export function useTripRepositorySummary(period: SummaryPeriod, pollMs = 5000): DrivingSummary {
  const pricePerLiter = useEffectivePricePerLiter();
  const [summary, setSummary] = useState<DrivingSummary>(emptyDrivingSummary());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const range = rangeFor(period);
      const result = await tripRepository.summary(range, pricePerLiter);
      if (!cancelled) setSummary(result);
    };
    load();
    const handle = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [period, pricePerLiter, pollMs]);

  return summary;
}
