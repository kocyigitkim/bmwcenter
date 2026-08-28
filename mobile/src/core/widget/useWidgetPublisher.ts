import { useEffect } from "react";
import { AppState } from "react-native";
import { publishWidgetState } from "./widgetPublisher";

/** Slower than anything the user watches — the widget's own refresh is
 * half-hourly, so this only needs to keep the file from going stale. */
const INTERVAL_MS = 60_000;

/**
 * Keeps the widget file current while the app is running.
 *
 * Also publishes when the app goes to the background, which is exactly the
 * moment the user is most likely to look at their home screen.
 */
export function useWidgetPublisher(): void {
  useEffect(() => {
    const handle = setInterval(() => {
      publishWidgetState().catch(() => undefined);
    }, INTERVAL_MS);

    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "background" || next === "inactive") {
        publishWidgetState(Date.now(), true).catch(() => undefined);
      }
    });

    return () => {
      clearInterval(handle);
      subscription.remove();
    };
  }, []);
}
