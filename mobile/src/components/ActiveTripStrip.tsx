import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import { useTripRecorder } from "@/core/trip/tripRecorder";
import { useLiveClock } from "@/hooks/useLiveClock";

/** Pinned dashboard chrome showing the in-progress trip. Reads `useTripRecorder.live`,
 * which the recorder updates on every OBD snapshot — the persisted Trip row stays at
 * zero until the trip is finalized, so it must never be the source here. */
export function ActiveTripStrip() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const state = useTripRecorder((s) => s.state);
  const live = useTripRecorder((s) => s.live);
  const settings = useAppSettings();
  const pricePerLiter = useEffectivePricePerLiter();

  const isActive = state.kind === "recording" || state.kind === "paused";
  // Duration must keep ticking between OBD snapshots, so derive it from wall-clock.
  const now = useLiveClock(isActive ? 1000 : null);

  if (!isActive) return null;

  const durationS = live.startedAt != null ? Math.max(0, (now - live.startedAt) / 1000) : live.durationS;
  const cost = live.fuelUsedL * pricePerLiter;
  const isPaused = state.kind === "paused";

  return (
    <View style={[styles.container, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
      <View style={styles.header}>
        <MaterialCommunityIcons
          name={isPaused ? "pause-circle" : "record-circle"}
          size={16}
          color={isPaused ? colors.contentTertiary : colors.semNominal}
        />
        <Text style={[styles.headerText, { color: colors.contentSecondary }]}>
          {t(isPaused ? "trip.live.paused" : "trip.live.recording")}
        </Text>
        <Text style={[styles.duration, { color: colors.contentPrimary }]}>{Formatters.duration(durationS)}</Text>
      </View>

      <View style={styles.metrics}>
        <Metric label={t("trip.live.distance")} value={Formatters.distance(live.distanceKm, settings)} />
        <Metric label={t("trip.live.fuelUsed")} value={`${Formatters.number(live.fuelUsedL, 2)} L`} />
        <Metric
          label={t("trip.live.consumption")}
          value={live.avgL100 != null ? Formatters.consumption(live.avgL100, settings) : "—"}
        />
        <Metric
          label={t("trip.live.cost")}
          value={Formatters.currency(cost, settings.currencyCode)}
          highlight
        />
      </View>
    </View>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: colors.contentTertiary }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.metricValue, { color: highlight ? brandPrimary : colors.contentPrimary }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: DSSpace.s3 },
  headerText: { fontSize: 12, fontWeight: "600", flex: 1 },
  duration: { fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] },
  metrics: { flexDirection: "row", gap: DSSpace.s2 },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { fontSize: 10, marginBottom: 2 },
  metricValue: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
});
