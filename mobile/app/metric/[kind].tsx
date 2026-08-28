import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { MetricChart } from "@/components/MetricChart";
import { useAppSettings } from "@/core/settings/appSettings";
import { useOBDStore } from "@/core/obd/obdService";
import { metricHistory, summarize, type MetricSample } from "@/core/metrics/metricHistory";
import { graphableFor } from "@/core/metrics/widgetMetric";
import { titleKey, icon as widgetIcon } from "@/core/dashboard/dashboardWidgetKind";
import type { DashboardWidgetKind } from "@/core/dashboard/dashboardWidgetKind";

/** The history only grows as fast as the poll loop; a second between redraws
 * keeps the chart live without re-rendering on every frame. */
const REFRESH_MS = 1000;

export default function MetricScreen() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const connected = useOBDStore((s) => s.connection.status === "connected");
  const [tick, setTick] = useState(0);

  const widgetKind = kind as DashboardWidgetKind;
  const metric = graphableFor(widgetKind);

  useEffect(() => {
    const handle = setInterval(() => setTick((v) => v + 1), REFRESH_MS);
    return () => clearInterval(handle);
  }, []);

  const series = useMemo(() => {
    if (!metric) return undefined;
    const raw = metricHistory.series(metric.key);
    if (!raw) return undefined;
    // Convert once, here, so the axis, the stats and the scrub readout all
    // agree with the units the rest of the app is showing.
    const converted: MetricSample[] = raw.samples.map((s) => ({
      t: s.t,
      value: metric.convert(s.value, settings),
    }));
    return summarize(raw.key, converted);
    // `tick` is the live-refresh signal; the history itself is not reactive.
     
  }, [metric, settings, tick]);

  const unit = metric ? t(metric.unitKey(settings)) : "";
  const format = (value: number) => `${Formatters.number(value, metric?.precision ?? 0)} ${unit}`;

  const title = metric ? t(titleKey[widgetKind]) : t("metricGraph.unknown");
  const iconName = (widgetIcon[widgetKind] ?? "chart-line") as keyof typeof MaterialCommunityIcons.glyphMap;

  const windowMinutes = series
    ? Math.max(1, Math.round((series.samples[series.samples.length - 1]!.t - series.samples[0]!.t) / 60000))
    : 0;

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <MaterialCommunityIcons name={iconName} size={20} color={colors.contentSecondary} />
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{title}</Text>
      </View>

      {!metric ? (
        <Text style={[styles.notice, { color: colors.contentSecondary }]}>{t("metricGraph.notGraphable")}</Text>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
            <Text style={[styles.current, { color: colors.contentPrimary }]}>
              {series ? format(series.last) : "--"}
            </Text>
            <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>
              {series
                ? t("metricGraph.window", { count: windowMinutes })
                : connected
                  ? t("metricGraph.waiting")
                  : t("metricGraph.notConnected")}
            </Text>

            <View style={{ marginTop: DSSpace.s4 }}>
              <MetricChart
                samples={series?.samples ?? []}
                color={brandPrimary}
                formatValue={format}
                emptyText={connected ? t("metricGraph.waiting") : t("metricGraph.notConnected")}
              />
            </View>

            {series && (
              <View style={styles.statsRow}>
                <Stat label={t("metricGraph.min")} value={format(series.min)} />
                <Stat label={t("metricGraph.avg")} value={format(series.avg)} />
                <Stat label={t("metricGraph.max")} value={format(series.max)} />
              </View>
            )}
          </View>

          <Text style={[styles.footnote, { color: colors.contentTertiary }]}>{t("metricGraph.footnote")}</Text>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.contentPrimary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s2,
    paddingHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s4,
  },
  title: { fontSize: 22, fontWeight: "700" },
  card: {
    marginHorizontal: DSSpace.screenEdge,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  current: { fontSize: 34, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statsRow: { flexDirection: "row", marginTop: DSSpace.s4 },
  notice: { paddingHorizontal: DSSpace.screenEdge, fontSize: 14, lineHeight: 20 },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s4,
  },
});
