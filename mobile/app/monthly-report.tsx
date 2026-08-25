import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import { emptyDrivingSummary, type DrivingSummary, type Trip } from "@/core/storage/models";
import { buildMonthlyReportPDF } from "@/core/export/pdfReportBuilder";

export default function MonthlyReportScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const pricePerLiter = useEffectivePricePerLiter();
  const [summary, setSummary] = useState<DrivingSummary>(emptyDrivingSummary());
  const [trips, setTrips] = useState<Trip[]>([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    tripRepository.trips({ start: start.getTime(), end: now }).then((list) => {
      setTrips(list);
      tripRepository.summary({ start: start.getTime(), end: now }, pricePerLiter).then(setSummary);
    });
  }, [pricePerLiter]);

  const share = async () => {
    setGenerating(true);
    try {
      const uri = await buildMonthlyReportPDF(trips, pricePerLiter, settings.vehicleName);
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri);
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("insights.monthlyReport")}</Text>
      </View>
      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>
            {Formatters.distance(summary.distanceKm, settings)}
          </Text>
          <Text style={{ color: colors.contentSecondary }}>{t("trip.distance")}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>
            {Formatters.liters(summary.fuelUsedL)}
          </Text>
          <Text style={{ color: colors.contentSecondary }}>{t("unit.liter")}</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>
            {Formatters.currency(summary.estimatedCost, settings.currencyCode)}
          </Text>
          <Text style={{ color: colors.contentSecondary }}>{t("fuel.cost")}</Text>
        </View>
        <Pressable onPress={share} disabled={generating} style={[styles.shareButton, { backgroundColor: brandPrimary }]}>
          {generating ? <ActivityIndicator color="#fff" /> : <Text style={styles.shareText}>{t("insights.generateReport")}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  card: { padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  shareButton: { padding: 14, borderRadius: DSRadius.card, alignItems: "center", marginTop: DSSpace.s2 },
  shareText: { color: "#fff", fontWeight: "700" },
});
