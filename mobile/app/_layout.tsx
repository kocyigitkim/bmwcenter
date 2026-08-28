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
import { CareFullScreenAlert } from "@/components/CareFullScreenAlert";
import { TripSummaryCardModal } from "@/components/TripSummaryCardModal";

function RootStack() {
  const { scheme } = useTheme();
  useAlertEngineRunner();
  useTripRecorderRunner();
  useCareCoordinatorRunner();
  useFuelPriceRunner();
  useAutoConnectRunner();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false }} />
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
