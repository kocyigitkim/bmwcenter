import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import { tripRepository } from "@/core/storage/tripRepository";
import { activeVehicle } from "@/core/vehicle/useGarage";
import {
  DEFAULT_AUTO_RULE,
  MILEAGE_CATEGORIES,
  categoryOf,
  monthsWithTrips,
  startOfMonth,
  startOfNextMonth,
  summarise,
  toCSV,
  tripsInPeriod,
  tripsRuleWouldChange,
  type AutoRule,
  type MileageCategory,
  type MileageTrip,
} from "@/core/mileage/mileageLog";
import { buildMileageReportData, buildMileageReportPDF } from "@/core/mileage/mileageReport";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const CATEGORY_ICON: Record<MileageCategory, IconName> = {
  business: "briefcase-outline",
  personal: "home-outline",
  other: "dots-horizontal",
};

export default function MileageScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const pricePerLiter = useEffectivePricePerLiter();

  const [trips, setTrips] = useState<MileageTrip[]>([]);
  const [month, setMonth] = useState(() => startOfMonth(Date.now()));
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const all = await tripRepository.trips({ start: 0, end: Date.now() });
    setTrips(
      all
        .filter((trip) => trip.endedAt != null)
        .map((trip) => ({
          id: trip.id,
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          distanceKm: trip.distanceKm,
          fuelUsedL: trip.fuelUsedL,
          category: trip.category,
          startPlaceName: trip.startPlaceName,
          endPlaceName: trip.endPlaceName,
          note: trip.note,
        }))
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => undefined);
    }, [reload])
  );

  const months = useMemo(() => monthsWithTrips(trips), [trips]);
  const periodFrom = month;
  const periodTo = startOfNextMonth(month);
  const inMonth = useMemo(() => tripsInPeriod(trips, periodFrom, periodTo), [trips, periodFrom, periodTo]);
  const summary = useMemo(
    () => summarise(inMonth, pricePerLiter, periodFrom, periodTo),
    [inMonth, pricePerLiter, periodFrom, periodTo]
  );

  const periodLabel = new Date(month).toLocaleDateString(i18n.language, { month: "long", year: "numeric" });

  const setCategory = async (id: string, category: MileageCategory) => {
    await tripRepository.setCategory(id, category);
    await reload();
  };

  const exportPDF = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const data = buildMileageReportData({
        now: Date.now(),
        vehicleName: activeVehicle()?.name || settings.vehicleName,
        periodLabel,
        trips: inMonth,
        from: periodFrom,
        to: periodTo,
        pricePerLiter,
        currencyCode: settings.currencyCode,
        ratePerKm: settings.mileageRatePerKm > 0 ? settings.mileageRatePerKm : undefined,
      });
      const uri = await buildMileageReportPDF(data, t);
      if (!uri) {
        Alert.alert(t("mileage.failedTitle"), t("mileage.failedBody"));
        return;
      }
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = new File(Paths.cache, `mileage-${new Date(month).toISOString().slice(0, 7)}.csv`);
      file.create({ overwrite: true });
      file.write(toCSV(inMonth, pricePerLiter, settings.currencyCode));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
      }
    } catch {
      Alert.alert(t("mileage.failedTitle"), t("mileage.failedBody"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("mileage.title")}</Text>
      </View>

      {months.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthRow}>
          {months.map((m) => (
            <Pressable
              key={m}
              onPress={() => setMonth(m)}
              style={[styles.monthChip, { backgroundColor: m === month ? brandPrimary : colors.surface2 }]}
            >
              <Text style={{ color: m === month ? "#fff" : colors.contentPrimary, fontSize: 12, fontWeight: "600" }}>
                {new Date(m).toLocaleDateString(i18n.language, { month: "short", year: "2-digit" })}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
        <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>{periodLabel}</Text>
        <Text style={[styles.heroValue, { color: colors.contentPrimary }]}>
          {Formatters.odometer(summary.byCategory.find((c) => c.category === "business")!.distanceKm, settings)}
        </Text>
        <Text style={{ color: colors.contentSecondary, fontSize: 13 }}>
          {t("mileage.businessOfTotal", {
            share: Math.round(summary.businessShare * 100),
            total: Formatters.odometer(summary.totalDistanceKm, settings),
          })}
        </Text>

        <View style={styles.totalsRow}>
          {summary.byCategory.map((c) => (
            <View key={c.category} style={{ flex: 1 }}>
              <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>{t(`mileage.category.${c.category}`)}</Text>
              <Text style={{ color: colors.contentPrimary, fontSize: 14, fontWeight: "600" }}>
                {Formatters.currency(c.fuelCost, settings.currencyCode)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <AutoRuleCard trips={trips} onApplied={reload} />

      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>
        {t("mileage.tripsHeading", { count: inMonth.length })}
      </Text>

      {inMonth.length === 0 ? (
        <Text style={[styles.empty, { color: colors.contentTertiary }]}>{t("mileage.noTrips")}</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface1, paddingVertical: 0 }]}>
          {inMonth.map((trip, i) => (
            <TripRow
              key={trip.id}
              trip={trip}
              last={i === inMonth.length - 1}
              onSelect={(category) => setCategory(trip.id, category)}
            />
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.s3, marginTop: DSSpace.s5 }}>
        <Pressable onPress={exportPDF} disabled={busy} style={[styles.action, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="file-document-outline" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, flex: 1, marginLeft: DSSpace.s3 }}>{t("mileage.exportPDF")}</Text>
          {busy && <ActivityIndicator size="small" />}
        </Pressable>
        <Pressable onPress={exportCSV} disabled={busy} style={[styles.action, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="file-delimited-outline" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, flex: 1, marginLeft: DSSpace.s3 }}>{t("mileage.exportCSV")}</Text>
        </Pressable>
      </View>

      <RateCard />

      <Text style={[styles.footnote, { color: colors.contentTertiary }]}>{t("mileage.footnote")}</Text>
    </ScrollView>
  );
}

function TripRow({
  trip,
  last,
  onSelect,
}: {
  trip: MileageTrip;
  last: boolean;
  onSelect: (category: MileageCategory) => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const current = categoryOf(trip);

  const route = [trip.startPlaceName, trip.endPlaceName].filter(Boolean).join(" → ");

  return (
    <View
      style={[
        styles.tripRow,
        !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: colors.contentPrimary, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
          {route || t("mileage.untitledTrip")}
        </Text>
        <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>
          {new Date(trip.startedAt).toLocaleDateString(i18n.language, { day: "numeric", month: "short" })}
          {" · "}
          {Formatters.odometer(trip.distanceKm, settings)}
        </Text>
      </View>

      <View style={styles.categoryPicker}>
        {MILEAGE_CATEGORIES.map((category) => {
          const active = category === current;
          return (
            <Pressable
              key={category}
              onPress={() => onSelect(category)}
              hitSlop={4}
              style={[
                styles.categoryButton,
                { backgroundColor: active ? withAlpha(brandPrimary, 0.16) : "transparent" },
              ]}
            >
              <MaterialCommunityIcons
                name={CATEGORY_ICON[category]}
                size={17}
                color={active ? brandPrimary : colors.contentTertiary}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The rule proposes; the user disposes. It never rewrites categories on its own. */
function AutoRuleCard({ trips, onApplied }: { trips: MileageTrip[]; onApplied: () => Promise<void> }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();

  const rule = useMemo<AutoRule>(() => {
    try {
      return settings.mileageAutoRuleJSON
        ? { ...DEFAULT_AUTO_RULE, ...(JSON.parse(settings.mileageAutoRuleJSON) as Partial<AutoRule>) }
        : DEFAULT_AUTO_RULE;
    } catch {
      return DEFAULT_AUTO_RULE;
    }
  }, [settings.mileageAutoRuleJSON]);

  const save = (next: AutoRule) => settings.set("mileageAutoRuleJSON", JSON.stringify(next));

  const apply = async () => {
    const changes = tripsRuleWouldChange({ ...rule, enabled: true }, trips);
    if (changes.length === 0) {
      Alert.alert(t("mileage.rule.nothingTitle"), t("mileage.rule.nothingBody"));
      return;
    }
    Alert.alert(t("mileage.rule.confirmTitle"), t("mileage.rule.confirmBody", { count: changes.length }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("mileage.rule.apply"),
        onPress: async () => {
          for (const change of changes) await tripRepository.setCategory(change.id, change.to);
          await onApplied();
        },
      },
    ]);
  };

  const hours = `${String(Math.floor(rule.fromMinute / 60)).padStart(2, "0")}:00–${String(
    Math.floor(rule.toMinute / 60)
  ).padStart(2, "0")}:00`;

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 15, fontWeight: "600" }}>{t("mileage.rule.title")}</Text>
          <Text style={{ color: colors.contentTertiary, fontSize: 12, marginTop: 1 }}>
            {t("mileage.rule.summary", { hours })}
          </Text>
        </View>
        <Switch value={rule.enabled} onValueChange={(enabled) => save({ ...rule, enabled })} />
      </View>

      {rule.enabled && (
        <Pressable onPress={apply} style={{ marginTop: DSSpace.s3 }}>
          <Text style={{ color: brandPrimary, fontWeight: "600", fontSize: 13 }}>
            {t("mileage.rule.applyToExisting")}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** The rate is the user's to supply — it is set by their tax authority or
 * employer and changes yearly, so the app never guesses one. */
function RateCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const [text, setText] = useState(settings.mileageRatePerKm > 0 ? String(settings.mileageRatePerKm) : "");

  const commit = (value: string) => {
    setText(value);
    const parsed = Number(value.replace(",", "."));
    settings.set("mileageRatePerKm", Number.isFinite(parsed) && parsed > 0 ? parsed : 0);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1, marginTop: DSSpace.s5 }]}>
      <Text style={{ color: colors.contentPrimary, fontSize: 15, fontWeight: "600" }}>{t("mileage.rate.title")}</Text>
      <Text style={{ color: colors.contentTertiary, fontSize: 12, marginTop: 1, marginBottom: DSSpace.s3 }}>
        {t("mileage.rate.hint")}
      </Text>
      <View style={[styles.rateRow, { borderColor: colors.hairline }]}>
        <TextInput
          value={text}
          onChangeText={commit}
          keyboardType="numeric"
          placeholder="0"
          placeholderTextColor={colors.contentTertiary}
          style={{ color: colors.contentPrimary, flex: 1, fontSize: 16, paddingVertical: 10 }}
        />
        <Text style={{ color: colors.contentSecondary, fontSize: 13 }}>
          {t("mileage.rate.unit", { currency: settings.currencyCode })}
        </Text>
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
  monthRow: { paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.s2, paddingBottom: DSSpace.s4 },
  monthChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  card: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  heroValue: { fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"], marginVertical: 2 },
  totalsRow: { flexDirection: "row", marginTop: DSSpace.s4, gap: DSSpace.s3 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginBottom: DSSpace.s2,
    marginTop: DSSpace.s2,
  },
  tripRow: { flexDirection: "row", alignItems: "center", paddingVertical: DSSpace.s3 },
  categoryPicker: { flexDirection: "row", gap: 2, marginLeft: DSSpace.s3 },
  categoryButton: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  action: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  rateRow: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, borderBottomWidth: StyleSheet.hairlineWidth },
  empty: { paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, fontSize: 13 },
  footnote: {
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s5,
  },
});
