import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import { emptyDrivingSummary, type DrivingSummary } from "@/core/storage/models";
import * as Sharing from "expo-sharing";
import { buildMechanicReportPDF } from "@/core/export/mechanicReport";
import { ScoreRing } from "@/components/ScoreRing";
import type { ScoreBreakdown } from "@/core/analysis/drivingScorer";

export default function InsightsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const pricePerLiter = useEffectivePricePerLiter();
  const router = useRouter();
  const [summary, setSummary] = useState<DrivingSummary>(emptyDrivingSummary());
  const [latestBreakdown, setLatestBreakdown] = useState<ScoreBreakdown | undefined>();

  useFocusEffect(
    useCallback(() => {
      const end = Date.now();
      const start = end - 30 * 86400_000;
      tripRepository.summary({ start, end }, pricePerLiter).then(setSummary);
      tripRepository.recentTrips(1).then(([latest]) => {
        if (latest?.scoreBreakdownJSON) {
          try {
            setLatestBreakdown(JSON.parse(latest.scoreBreakdownJSON));
          } catch {
            setLatestBreakdown(undefined);
          }
        }
      });
    }, [pricePerLiter])
  );

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("insights.title")}</Text>
      <Text style={[styles.subtitle, { color: colors.contentSecondary }]}>{t("insights.last30days")}</Text>

      <View style={[styles.scoreCard, { backgroundColor: colors.surface1, marginHorizontal: DSSpace.screenEdge }]}>
        <ScoreRing score={summary.avgScore} breakdown={latestBreakdown} />
      </View>

      <View style={[styles.grid, { paddingHorizontal: DSSpace.screenEdge }]}>
        <Stat label={t("insights.tripCount")} value={Formatters.number(summary.tripCount, 0)} />
        <Stat label={t("trip.distance")} value={Formatters.distance(summary.distanceKm, settings)} />
        <Stat label={t("unit.liter")} value={Formatters.liters(summary.fuelUsedL)} />
        <Stat label={t("insights.idleFuel")} value={Formatters.liters(summary.idleFuelL)} />
        <Stat label={t("trip.average")} value={Formatters.consumption(summary.avgL100 === 0 ? undefined : summary.avgL100, settings)} />
        <Stat label={t("fuel.cost")} value={Formatters.currency(summary.estimatedCost, settings.currencyCode)} />
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap, marginTop: DSSpace.cardGap }}>
        <NavRow icon="heart-pulse" label={t("health.title")} onPress={() => router.push("/health")} />
        <NavRow icon="chart-timeline-variant" label={t("trends.title")} onPress={() => router.push("/trends")} />
        <NavRow icon="briefcase-outline" label={t("mileage.title")} onPress={() => router.push("/mileage")} />
        <NavRow icon="calendar-month" label={t("insights.monthlyReport")} onPress={() => router.push("/monthly-report")} />
        <NavRow icon="wrench" label={t("insights.maintenance")} onPress={() => router.push("/maintenance")} />
        <NavRow icon="alert-circle-outline" label={t("insights.dtc")} onPress={() => router.push("/scan")} />
        <NavRow icon="battery-heart-variant" label={t("insights.batteryHealth")} onPress={() => router.push("/battery-health")} />
        <NavRow icon="timer-outline" label={t("insights.accelTest")} onPress={() => router.push("/accel-test")} />
        <MechanicReportRow />
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface1 }]}>
      <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/**
 * Builds the workshop report and hands it straight to the share sheet — the
 * point of the report is to leave the phone, so there is no screen in between.
 */
function MechanicReportRow() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await buildMechanicReportPDF();
      if (!uri) {
        Alert.alert(t("report.failedTitle"), t("report.failedBody"));
        return;
      }
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Pressable onPress={generate} disabled={busy} style={[styles.navRow, { backgroundColor: colors.surface1 }]}>
      <MaterialCommunityIcons name="file-document-outline" size={20} color={brandPrimary} />
      <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
        <Text style={{ color: colors.contentPrimary }}>{t("report.generate")}</Text>
        <Text style={{ color: colors.contentTertiary, fontSize: 11, marginTop: 1 }}>
          {busy ? t("report.generating") : t("report.generateHint")}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" />
      ) : (
        <MaterialCommunityIcons name="share-variant" size={18} color={colors.contentTertiary} />
      )}
    </Pressable>
  );
}

function NavRow({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.navRow, { backgroundColor: colors.surface1 }]}>
      <MaterialCommunityIcons name={icon} size={20} color={brandPrimary} />
      <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", paddingHorizontal: DSSpace.screenEdge },
  subtitle: { fontSize: 13, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  scoreCard: { padding: DSSpace.cardPadding, borderRadius: DSRadius.card, marginBottom: DSSpace.cardGap, alignItems: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: DSSpace.cardGap },
  stat: { width: "47%", padding: DSSpace.cardPadding, borderRadius: DSRadius.tile },
  navRow: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
