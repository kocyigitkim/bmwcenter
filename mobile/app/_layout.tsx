import "@/polyfills";
import "@/i18n";
import React, { useEffect, useRef, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "@/design/theme";
import { bootstrapDatabase, migrateDatabase } from "@/core/storage/db";
import { useGarage } from "@/core/vehicle/useGarage";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { shouldShowOnboarding } from "@/core/onboarding/onboardingState";
import { maintenanceNotifier } from "@/core/maintenance/maintenanceNotifier";
import { useAlertEngineRunner } from "@/core/alerts/useAlertEngineRunner";
import { useTripRecorderRunner } from "@/core/trip/useTripRecorderRunner";
import { useCareCoordinatorRunner } from "@/core/care/useCareCoordinatorRunner";
import { useFuelPriceRunner } from "@/core/fuel/useFuelPriceRunner";
import { useAutoConnectRunner } from "@/core/obd/useAutoConnectRunner";
import { useTripNotificationRunner } from "@/core/notifications/useTripNotificationRunner";
import { BackgroundPermissionSheet } from "@/components/BackgroundPermissionSheet";
import { tripNotification } from "@/core/notifications/tripNotification";
import { CareFullScreenAlert } from "@/components/CareFullScreenAlert";
import { TripSummaryCardModal } from "@/components/TripSummaryCardModal";

// Must be registered before any trip starts its foreground-service notification.
// Module scope of the root layout runs once, ahead of all screens.
tripNotification.registerForegroundService();

/**
 * Sends a genuinely new install through setup once.
 *
 * The check runs against the data, not just the flag: the flag did not exist
 * for anyone who installed an earlier build, and ambushing them with a wizard
 * on top of two years of history would be worse than never showing it.
 */
function useOnboardingRedirect() {
  const router = useRouter();
  const completedAt = useAppSettings((s) => s.onboardingCompletedAt);
  const set = useAppSettings((s) => s.set);
  const vehicles = useGarage((s) => s.vehicles);
  const garageReady = useGarage((s) => s.ready);
  const decided = useRef(false);

  useEffect(() => {
    if (decided.current || !garageReady) return;
    decided.current = true;

    (async () => {
      const trips = await tripRepository.recentTrips(1).catch(() => []);
      const signals = {
        completedAt,
        hasTrips: trips.length > 0,
        hasDescribedVehicle: vehicles.some((v) => !v.isSeeded),
        hasPairedAdapter: useAppSettings.getState().lastAdapterId != null,
      };
      if (shouldShowOnboarding(signals)) {
        router.replace("/onboarding");
      } else if (completedAt == null) {
        // Remember that this install was already set up, so the check does not
        // have to be made again on every launch.
        set("onboardingCompletedAt", Date.now());
      }
    })().catch(() => undefined);
  }, [completedAt, garageReady, router, set, vehicles]);
}

function RootStack() {
  const { scheme } = useTheme();
  useOnboardingRedirect();
  useAlertEngineRunner();
  useTripRecorderRunner();
  useCareCoordinatorRunner();
  useFuelPriceRunner();
  useAutoConnectRunner();
  useTripNotificationRunner();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
      <BackgroundPermissionSheet />
      <CareFullScreenAlert />
      <TripSummaryCardModal />
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    bootstrapDatabase();
    migrateDatabase();
    // The garage decides which vehicle every query is scoped to, so nothing may
    // render until it has loaded.
    useGarage
      .getState()
      .load()
      // Intervals are scoped to the active vehicle, so this waits for the garage.
      .then(() => {
        maintenanceNotifier.watchGarage();
        return maintenanceNotifier.check();
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <RootStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
