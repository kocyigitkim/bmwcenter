import { useEffect, useState } from "react";

/** Re-renders on an interval so wall-clock-derived values (elapsed time) stay live
 * between data updates. Pass `null` to stop ticking. */
export function useLiveClock(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (intervalMs == null) return;
    setNow(Date.now());
    const handle = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(handle);
  }, [intervalMs]);

  return now;
}
