import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { useOBDStore } from "@/core/obd/obdService";
import { tripRepository, type DateInterval } from "@/core/storage/tripRepository";
import { fuelRepository } from "@/core/storage/fuelRepository";
import { fuelStatistics } from "@/core/fuel/fuelStatistics";
import { estimatedRangeKm } from "@/core/fuel/fuelCalculator";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import { useRemoteFuelPrices } from "@/core/fuel/remoteFuelPriceStore";
import { emptyDrivingSummary, type DrivingSummary, type RefuelEntry } from "@/core/storage/models";
import { AddRefuelSheet } from "@/components/AddRefuelSheet";

type Period = "today" | "week" | "month" | "all";
const PERIODS: Period[] = ["today", "week", "month", "all"];

function rangeFor(period: Period): DateInterval {
  const now = Date.now();
  switch (period) {
    case "today": {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return { start: start.getTime(), end: start.getTime() + 86400_000 };
    }
    case "week":
      return { start: now - 7 * 86400_000, end: now };
    case "month": {
      const start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      return { start: start.getTime(), end: now };
    }
    case "all":
      return { start: 0, end: now };
  }
}

export default function FuelScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const snapshot = useOBDStore((s) => s.snapshot);
  const pricePerLiter = useEffectivePricePerLiter();
  const livePrice = useRemoteFuelPrices((s) => s[settings.fuelType]);
  const priceUpdatedAt = useRemoteFuelPrices((s) => s.lastFetchedAt);

  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<DrivingSummary>(emptyDrivingSummary());
  const [daily, setDaily] = useState<Array<{ date: number; liters: number }>>([]);
  const [refuels, setRefuels] = useState<RefuelEntry[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const reload = useCallback(async () => {
    const range = rangeFor(period);
    const [s, d, r] = await Promise.all([
      tripRepository.summary(range, pricePerLiter),
      fuelStatistics.dailyFuel(),
      fuelRepository.allRefuels(),
    ]);
    setSummary(s);
    setDaily(d);
    setRefuels(r);
  }, [period, pricePerLiter]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    reload();
  }, [reload]);

  const rangeKm = estimatedRangeKm(
    snapshot.fuelLevelPct,
    settings.tankCapacityL,
    summary.avgL100 > 0 ? summary.avgL100 : undefined
  );
  const maxLiters = Math.max(...daily.map((d) => d.liters), 0.1);

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("tab.fuel")}</Text>

      <View style={styles.segment}>
        {PERIODS.map((p) => (
          <Pressable
            key={p}
            onPress={() => setPeriod(p)}
            style={[
              styles.segmentItem,
              { backgroundColor: p === period ? brandPrimary : colors.surface2 },
            ]}
          >
            <Text style={{ color: p === period ? "#fff" : colors.contentPrimary, fontSize: 13, fontWeight: "600" }}>
              {t(`fuel.${p}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
        <Text style={[styles.bigValue, { color: colors.contentPrimary }]}>{Formatters.number(summary.fuelUsedL, 2)}</Text>
        <Text style={{ color: colors.contentSecondary, marginBottom: DSSpace.s3 }}>{t("unit.liter")}</Text>
        <View style={styles.microRow}>
          <Micro label={t("trip.distance")} value={Formatters.distance(summary.distanceKm, settings)} />
          <Micro
            label={t("trip.average")}
            value={Formatters.consumption(summary.avgL100 === 0 ? undefined : summary.avgL100, settings)}
          />
          <Micro label={t("fuel.cost")} value={Formatters.currency(summary.estimatedCost, settings.currencyCode)} />
        </View>
        <View style={styles.priceSourceRow}>
          <MaterialCommunityIcons
            name={livePrice != null ? "cloud-check-outline" : "pencil-outline"}
            size={13}
            color={colors.contentTertiary}
          />
          <Text style={{ color: colors.contentTertiary, fontSize: 11, marginLeft: 4 }}>
            {livePrice != null
              ? t("fuel.priceSource.live", {
                  price: Formatters.currency(livePrice, settings.currencyCode),
                  time: priceUpdatedAt ? new Date(priceUpdatedAt).toLocaleDateString() : "",
                })
              : t("fuel.priceSource.manual", { price: Formatters.currency(pricePerLiter, settings.currencyCode) })}
          </Text>
        </View>
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.surface1 }]}>
        <View style={styles.chartRow}>
          {daily.map((d) => (
            <View key={d.date} style={styles.chartBarWrap}>
              <View
                style={[
                  styles.chartBar,
                  { height: Math.max(4, (d.liters / maxLiters) * 100), backgroundColor: brandPrimary },
                ]}
              />
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface1, flexDirection: "row", alignItems: "center" }]}>
        <MaterialCommunityIcons name="gas-station" size={28} color={brandPrimary} />
        <View style={{ marginLeft: DSSpace.s3, flex: 1 }}>
          <Text style={{ color: colors.contentSecondary, fontSize: 13 }}>{t("fuel.estimatedRange")}</Text>
          <Text style={[styles.rangeValue, { color: colors.contentPrimary }]}>{Formatters.distance(rangeKm, settings)}</Text>
          <Text style={{ color: colors.contentSecondary, fontSize: 13 }}>{Formatters.percent(snapshot.fuelLevelPct)}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
        <View style={styles.rowHeader}>
          <Text style={[styles.sectionTitle, { color: colors.contentPrimary }]}>{t("fuel.lastRefuel")}</Text>
          <Pressable onPress={() => setShowAdd(true)}>
            <Text style={{ color: brandPrimary, fontWeight: "600" }}>{t("fuel.addRefuel")}</Text>
          </Pressable>
        </View>
        {refuels.length === 0 ? (
          <Text style={{ color: colors.contentTertiary }}>{t("fuel.empty.title")}</Text>
        ) : (
          refuels.slice(0, 10).map((entry) => (
            <View key={entry.id} style={styles.refuelRow}>
              <View>
                <Text style={{ color: colors.contentPrimary }}>{new Date(entry.date).toLocaleDateString()}</Text>
                {entry.stationName ? (
                  <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{entry.stationName}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: colors.contentPrimary }}>{Formatters.liters(entry.liters)}</Text>
                {entry.isFullTank && (
                  <View style={[styles.badge, { backgroundColor: withAlpha(colors.semInfo, 0.2) }]}>
                    <Text style={{ color: colors.semInfo, fontSize: 11 }}>{t("fuel.fullTank")}</Text>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      <AddRefuelSheet
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSubmit={async (entry) => {
          await fuelRepository.addRefuel(entry, settings.currencyCode);
          setShowAdd(false);
          reload();
        }}
      />
    </ScrollView>
  );
}

function Micro({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>{value}</Text>
      <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  segment: { flexDirection: "row", gap: 6, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.cardGap },
  segmentItem: { flex: 1, paddingVertical: 8, borderRadius: 999, alignItems: "center" },
  card: { marginHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.cardGap, padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  bigValue: { fontSize: 34, fontWeight: "700" },
  priceSourceRow: { flexDirection: "row", alignItems: "center", marginTop: DSSpace.s2 },
  microRow: { flexDirection: "row", gap: DSSpace.s4 },
  chartCard: { marginHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.cardGap, padding: DSSpace.cardPadding, borderRadius: DSRadius.card, height: 140 },
  chartRow: { flex: 1, flexDirection: "row", alignItems: "flex-end", gap: 4 },
  chartBarWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  chartBar: { width: "70%", borderRadius: 3, minHeight: 4 },
  rangeValue: { fontSize: 22, fontWeight: "700" },
  rowHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: DSSpace.s2 },
  sectionTitle: { fontSize: 17, fontWeight: "600" },
  refuelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
});
