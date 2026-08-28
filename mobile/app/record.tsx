import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "@/design/theme";
import { useTripRecorder } from "@/core/trip/tripRecorder";
import { publishWidgetState } from "@/core/widget/widgetPublisher";

/**
 * The target of `quickcar://record`, opened by the quick settings tile.
 *
 * The tile deliberately has no idea what starting a trip involves; it opens
 * this, which asks the recorder — so there is one definition of a trip rather
 * than a second, drifting copy in Kotlin.
 *
 * It renders nothing: the toggle happens and the app lands on the dashboard.
 */
export default function RecordToggleScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const state = useTripRecorder((s) => s.state);
  const manualStart = useTripRecorder((s) => s.manualStart);
  const manualStop = useTripRecorder((s) => s.manualStop);
  const acted = useRef(false);

  useEffect(() => {
    // Guarded: re-rendering on the recorder's own state change must not toggle
    // a second time and undo what the tap just did.
    if (acted.current) return;
    acted.current = true;

    const recording = state.kind === "recording" || state.kind === "paused";
    if (recording) manualStop();
    else manualStart();

    publishWidgetState(Date.now(), true).catch(() => undefined);
    router.replace("/(tabs)");
  }, [manualStart, manualStop, router, state.kind]);

  return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
}
