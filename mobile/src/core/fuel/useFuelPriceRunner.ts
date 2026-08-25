import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as TaskManager from "expo-task-manager";
import * as BackgroundTask from "expo-background-task";
import { fetchFuelPricesIfDue, syncSettingsPriceFromRemote } from "./fuelPriceService";

const BACKGROUND_TASK_NAME = "quickcar-daily-fuel-price-fetch";

TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    await fetchFuelPricesIfDue();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

async function registerBackgroundFetch() {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK_NAME);
    if (isRegistered) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: 24 * 60, // minutes — best-effort daily; OS decides actual timing
    });
  } catch {
    // Background execution isn't guaranteed on every platform/OS version — the
    // foreground check on app-open below is the reliable fallback.
  }
}

/** Checks for a fresh fuel price on mount and every time the app returns to the
 * foreground; the actual network call is a no-op unless >24h have passed. Also
 * registers a best-effort OS background task for the same daily check. */
export function useFuelPriceRunner(): void {
  useEffect(() => {
    syncSettingsPriceFromRemote();
    fetchFuelPricesIfDue();
    registerBackgroundFetch();

    const onChange = (state: AppStateStatus) => {
      if (state === "active") fetchFuelPricesIfDue();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, []);
}
