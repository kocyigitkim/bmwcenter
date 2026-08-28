import "@/polyfills";
import "@/i18n";
import React, { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "@/design/theme";
import { bootstrapDatabase } from "@/core/storage/db";
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

function RootStack() {
  const { scheme } = useTheme();
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
    setReady(true);
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
