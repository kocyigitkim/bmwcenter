import React, { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { MetricChart } from "@/components/MetricChart";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { trendDirection, weeklyTrend, type TrendPoint } from "@/core/trip/routeMatching";
import type { Trip } from "@/core/storage/models";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const WEEKS = 10;

export default function TrendsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [trips, setTrips] = useState<Trip[]>([]);

  useFocusEffect(
    useCallback(() => {
      tripRepository.recentTrips(500).then(setTrips).catch(() => undefined);
    }, [])
  );

  const points = useMemo(() => weeklyTrend(trips, WEEKS), [trips]);
  const driven = points.filter((p) => p.tripCount > 0);

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("trends.title")}</Text>
      </View>

      {driven.length === 0 ? (
        <Text style={[styles.empty, { color: colors.contentSecondary }]}>{t("trends.empty")}</Text>
      ) : (
        <>
          <TrendCard
            icon="gas-station"
            title={t("trends.consumption")}
            points={points}
            valueOf={(p) => (p.avgL100 > 0 ? p.avgL100 : undefined)}
            format={(value) => Formatters.consumption(value, settings)}
            // Using less fuel is an improvement, so a falling line is good.
            lowerIsBetter
          />
          <TrendCard
            icon="speedometer"
            title={t("trends.speed")}
            points={points}
            valueOf={(p) => (p.avgSpeedKmh > 0 ? p.avgSpeedKmh : undefined)}
            format={(value) => Formatters.speed(value, settings)}
          />
          <TrendCard
            icon="star-circle-outline"
            title={t("trends.score")}
            points={points}
            valueOf={(p) => p.avgScore}
            format={(value) => Formatters.number(value, 0)}
          />
          <TrendCard
            icon="road-variant"
            title={t("trends.distance")}
            points={points}
            valueOf={(p) => (p.distanceKm > 0 ? p.distanceKm : undefined)}
            format={(value) => Formatters.distance(value, settings)}
          />

          <Text style={[styles.footnote, { color: colors.contentTertiary }]}>
            {t("trends.footnote", { weeks: WEEKS })}
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function TrendCard({
  icon,
  title,
  points,
  valueOf,
  format,
  lowerIsBetter = false,
}: {
  icon: IconName;
  title: string;
  points: TrendPoint[];
  valueOf: (point: TrendPoint) => number | undefined;
  format: (value: number) => string;
  lowerIsBetter?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Weeks with nothing recorded are gaps, not zeroes: a fortnight away should
  // not draw the line to the floor.
  const samples = points
    .map((p) => ({ t: p.weekStart, value: valueOf(p) }))
    .filter((s): s is { t: number; value: number } => s.value != null);

  const direction = trendDirection(points.map(valueOf));
  const latest = samples[samples.length - 1];

  const improving = direction == null ? undefined : lowerIsBetter ? direction < 0 : direction > 0;
  const notable = direction != null && Math.abs(direction) >= 0.05;
  const tint = !notable || improving == null ? colors.contentSecondary : improving ? colors.semNominal : colors.semAttention;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.icon, { backgroundColor: withAlpha(brandPrimary, 0.14) }]}>
          <MaterialCommunityIcons name={icon} size={18} color={brandPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 16, fontWeight: "700" }}>{title}</Text>
          <Text style={{ color: tint, fontSize: 12 }}>
            {direction == null
              ? t("trends.notEnough")
              : notable
                ? t(improving ? "trends.improving" : "trends.worsening", {
                    delta: `${Math.abs(Math.round(direction * 100))}%`,
                  })
                : t("trends.steady")}
          </Text>
        </View>
        {latest && (
          <Text style={{ color: colors.contentPrimary, fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
            {format(latest.value)}
          </Text>
        )}
      </View>

      <View style={{ marginTop: DSSpace.s3 }}>
        <MetricChart
          samples={samples}
          color={brandPrimary}
          height={130}
          formatValue={format}
          emptyText={t("trends.notEnough")}
        />
      </View>
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
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: DSSpace.s3 },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  empty: { paddingHorizontal: DSSpace.screenEdge, fontSize: 14, lineHeight: 21 },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s2,
  },
});
