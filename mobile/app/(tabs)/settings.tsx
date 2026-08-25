import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Switch, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import {
  useAppSettings,
  type ConsumptionUnit,
  type FuelType,
  type PressureUnit,
  type TemperatureUnit,
  type UnitSystem,
} from "@/core/settings/appSettings";
import * as Sharing from "expo-sharing";
import { tripRepository } from "@/core/storage/tripRepository";
import { exportTripsCSV } from "@/core/export/csvExporter";
import { useRemoteFuelPrices } from "@/core/fuel/remoteFuelPriceStore";
import { fetchAndApplyFuelPrices } from "@/core/fuel/fuelPriceService";
import { Formatters } from "@/design/formatters";

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("settings.title")}</Text>

      <Section title={t("settings.connection")}>
        <SwitchRow label={t("settings.autoConnect")} value={settings.autoConnectOnLaunch} onValueChange={(v) => settings.set("autoConnectOnLaunch", v)} />
        <SwitchRow label={t("settings.useMockAdapter")} value={settings.useMockAdapter} onValueChange={(v) => settings.set("useMockAdapter", v)} />
      </Section>

      <Section title={t("settings.units")}>
        <SegmentRow<UnitSystem>
          label={t("settings.unitSystem")}
          value={settings.unitSystem}
          options={[
            { value: "metric", label: t("units.metric") },
            { value: "imperial", label: t("units.imperial") },
          ]}
          onChange={(v) => settings.set("unitSystem", v)}
        />
        <SegmentRow<TemperatureUnit>
          label={t("settings.temperatureUnit")}
          value={settings.temperatureUnit}
          options={[
            { value: "celsius", label: "°C" },
            { value: "fahrenheit", label: "°F" },
          ]}
          onChange={(v) => settings.set("temperatureUnit", v)}
        />
        <SegmentRow<ConsumptionUnit>
          label={t("settings.consumptionUnit")}
          value={settings.consumptionUnit}
          options={[
            { value: "l100km", label: "L/100km" },
            { value: "kmPerL", label: "km/L" },
            { value: "mpgUS", label: "mpg" },
          ]}
          onChange={(v) => settings.set("consumptionUnit", v)}
        />
        <SegmentRow<PressureUnit>
          label={t("settings.pressureUnit")}
          value={settings.pressureUnit}
          options={[
            { value: "kpa", label: "kPa" },
            { value: "bar", label: "bar" },
            { value: "psi", label: "psi" },
          ]}
          onChange={(v) => settings.set("pressureUnit", v)}
        />
        <SegmentRow
          label={t("settings.language")}
          value={settings.languageCode}
          options={[
            { value: "en", label: "English" },
            { value: "tr", label: "Türkçe" },
          ]}
          onChange={(v) => {
            settings.set("languageCode", v);
            i18n.changeLanguage(v);
          }}
        />
      </Section>

      <Section title="">
        <Pressable onPress={() => router.push("/calibration")} style={styles.navRow}>
          <MaterialCommunityIcons name="tune-variant" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.calibration")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
        </Pressable>
        <Pressable onPress={() => router.push("/vehicle-profile")} style={styles.navRow}>
          <MaterialCommunityIcons name="car-cog" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.vehicleProfile")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
        </Pressable>
        <Pressable onPress={() => router.push("/dtc-catalog")} style={styles.navRow}>
          <MaterialCommunityIcons name="book-search" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.dtcCatalog")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
        </Pressable>
        <Pressable onPress={() => router.push("/capability-scan")} style={styles.navRow}>
          <MaterialCommunityIcons name="clipboard-check-outline" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.capabilities")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
        </Pressable>
      </Section>

      <Section title={t("settings.aboutVehicle")}>
        <TextRow
          label={t("settings.tankCapacity")}
          value={String(settings.tankCapacityL)}
          onChangeText={(v) => {
            const n = parseFloat(v.replace(",", "."));
            if (!Number.isNaN(n)) settings.set("tankCapacityL", n);
          }}
          keyboardType="decimal-pad"
        />
        <ReadOnlyRow label={t("settings.pricePerLiterManual")} value={Formatters.currency(settings.pricePerLiter, settings.currencyCode)} />
        <Text style={[styles.hint, { color: colors.contentTertiary }]}>{t("settings.pricePerLiterHint")}</Text>
        <TextRow label={t("settings.currency")} value={settings.currencyCode} onChangeText={(v) => settings.set("currencyCode", v.toUpperCase())} />
        <SegmentRow<FuelType>
          label={t("settings.fuelType")}
          value={settings.fuelType}
          options={[
            { value: "gasoline", label: t("fuelType.gasoline") },
            { value: "diesel", label: t("fuelType.diesel") },
            { value: "lpg", label: t("fuelType.lpg") },
          ]}
          onChange={(v) => settings.set("fuelType", v)}
        />
      </Section>

      <Section title={t("settings.fuelPrices")}>
        <LiveFuelPricesSection />
      </Section>

      <Section title={t("settings.vehicle")}>
        <SwitchRow label={t("settings.autoRecordTrips")} value={settings.autoRecordTrips} onValueChange={(v) => settings.set("autoRecordTrips", v)} />
        <SwitchRow label={t("settings.enableAlerts")} value={settings.enableAlerts} onValueChange={(v) => settings.set("enableAlerts", v)} />
        <SwitchRow label={t("settings.spokenAlerts")} value={settings.spokenAlerts} onValueChange={(v) => settings.set("spokenAlerts", v)} />
      </Section>

      <Section title={t("settings.care.protection")}>
        <SwitchRow label={t("settings.care.overheatWatchdog")} value={settings.careOverheatWatchdog} onValueChange={(v) => settings.set("careOverheatWatchdog", v)} />
        <SwitchRow label={t("settings.care.coldShield")} value={settings.careColdShield} onValueChange={(v) => settings.set("careColdShield", v)} />
        <SegmentRow<"auto" | "always" | "off">
          label={t("settings.care.thermalShock")}
          value={settings.careThermalShock}
          options={[
            { value: "auto", label: t("settings.care.auto") },
            { value: "always", label: t("settings.care.always") },
            { value: "off", label: t("settings.care.off") },
          ]}
          onChange={(v) => settings.set("careThermalShock", v)}
        />
        <SwitchRow label={t("settings.care.batteryGuardian")} value={settings.careBatteryGuardian} onValueChange={(v) => settings.set("careBatteryGuardian", v)} />
        <SwitchRow label={t("settings.care.fuelTrimMonitor")} value={settings.careFuelTrimMonitor} onValueChange={(v) => settings.set("careFuelTrimMonitor", v)} />
        <SwitchRow label={t("settings.care.thermostatWatch")} value={settings.careThermostatWatch} onValueChange={(v) => settings.set("careThermostatWatch", v)} />
        <SwitchRow label={t("settings.care.airflowWatch")} value={settings.careAirflowWatch} onValueChange={(v) => settings.set("careAirflowWatch", v)} />
        <SegmentRow<"early" | "balanced" | "calm">
          label={t("settings.care.sensitivity")}
          value={settings.careSensitivity}
          options={[
            { value: "early", label: t("settings.care.early") },
            { value: "balanced", label: t("settings.care.balanced") },
            { value: "calm", label: t("settings.care.calm") },
          ]}
          onChange={(v) => settings.set("careSensitivity", v)}
        />
      </Section>

      <Section title={t("settings.care.coaching")}>
        <SwitchRow label={t("settings.care.ecoCoach")} value={settings.careEcoCoach} onValueChange={(v) => settings.set("careEcoCoach", v)} />
        <SwitchRow label={t("settings.care.gearCoach")} value={settings.careGearCoach} onValueChange={(v) => settings.set("careGearCoach", v)} />
        <SwitchRow label={t("settings.care.spokenCues")} value={settings.careSpokenCues} onValueChange={(v) => settings.set("careSpokenCues", v)} />
        <SegmentRow<"low" | "normal" | "high">
          label={t("settings.care.cueFrequency")}
          value={settings.careCueFrequency}
          options={[
            { value: "low", label: t("settings.care.low") },
            { value: "normal", label: t("settings.care.normalFreq") },
            { value: "high", label: t("settings.care.high") },
          ]}
          onChange={(v) => settings.set("careCueFrequency", v)}
        />
        <SwitchRow label={t("settings.care.positiveTones")} value={settings.carePositiveTones} onValueChange={(v) => settings.set("carePositiveTones", v)} />
      </Section>

      <Section title={t("settings.care.motivation")}>
        <SwitchRow label={t("settings.care.weeklyChallenges")} value={settings.careWeeklyChallenges} onValueChange={(v) => settings.set("careWeeklyChallenges", v)} />
        <SwitchRow label={t("settings.care.badgesStreak")} value={settings.careBadgesStreak} onValueChange={(v) => settings.set("careBadgesStreak", v)} />
        <SwitchRow label={t("settings.care.tripSummaryCard")} value={settings.careTripSummaryCard} onValueChange={(v) => settings.set("careTripSummaryCard", v)} />
        <SwitchRow label={t("settings.care.hideLocationSharing")} value={settings.careHideLocationSharing} onValueChange={(v) => settings.set("careHideLocationSharing", v)} />
      </Section>

      <Section title={t("settings.care.maintenance")}>
        <SwitchRow label={t("settings.care.adaptiveIntervals")} value={settings.careAdaptiveIntervals} onValueChange={(v) => settings.set("careAdaptiveIntervals", v)} />
        <SwitchRow label={t("settings.care.showSeverityFactor")} value={settings.careShowSeverityFactor} onValueChange={(v) => settings.set("careShowSeverityFactor", v)} />
      </Section>

      <Section title="">
        <Pressable
          onPress={async () => {
            const all = await tripRepository.trips({ start: 0, end: Date.now() });
            const uri = await exportTripsCSV(all);
            if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
          }}
          style={styles.navRow}
        >
          <MaterialCommunityIcons name="file-delimited-outline" size={20} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.exportAllCSV")}</Text>
        </Pressable>
        <Pressable
          onPress={() => tripRepository.deleteAll()}
          style={[styles.dangerRow, { backgroundColor: colors.surface1 }]}
        >
          <Text style={{ color: colors.semCritical, fontWeight: "600" }}>{t("settings.resetData")}</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function LiveFuelPricesSection() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const prices = useRemoteFuelPrices();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetchAndApplyFuelPrices();
    } finally {
      setRefreshing(false);
    }
  };

  const rows: Array<{ type: FuelType; value: number | undefined }> = [
    { type: "gasoline", value: prices.gasoline },
    { type: "diesel", value: prices.diesel },
    { type: "lpg", value: prices.lpg },
  ];

  return (
    <View>
      {rows.map((row) => (
        <View key={row.type} style={styles.row}>
          <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t(`fuelType.${row.type}`)}</Text>
          <Text style={{ color: colors.contentSecondary }}>
            {row.value != null ? Formatters.currency(row.value, prices.currencyCode ?? "TRY") : t("settings.fuelPrices.none")}
          </Text>
        </View>
      ))}
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Text style={{ color: colors.contentTertiary, fontSize: 12, flex: 1 }}>
          {prices.lastFetchedAt
            ? t("settings.fuelPrices.updated", { time: new Date(prices.lastFetchedAt).toLocaleString() })
            : t("settings.fuelPrices.neverUpdated")}
        </Text>
        <Pressable onPress={refresh} disabled={refreshing} hitSlop={8}>
          {refreshing ? <ActivityIndicator size="small" /> : <MaterialCommunityIcons name="refresh" size={18} color={brandPrimary} />}
        </Pressable>
      </View>
      <Text style={{ color: colors.contentTertiary, fontSize: 10, paddingHorizontal: DSSpace.s3, paddingBottom: DSSpace.s2 }}>
        {t("settings.fuelPrices.attribution")}
      </Text>
    </View>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.contentPrimary, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.contentSecondary, fontWeight: "600" }}>{value}</Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s5 }}>
      {title ? <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{title}</Text> : null}
      <View style={[styles.sectionCard, { backgroundColor: colors.surface1 }]}>{children}</View>
    </View>
  );
}

function SwitchRow({ label, value, onValueChange }: { label: string; value: boolean; onValueChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.contentPrimary, flex: 1 }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

function TextRow({
  label,
  value,
  onChangeText,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  keyboardType?: "default" | "decimal-pad";
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.contentPrimary, flex: 1 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        style={{ color: colors.contentPrimary, textAlign: "right", minWidth: 80 }}
      />
    </View>
  );
}

function SegmentRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { flexDirection: "column", alignItems: "stretch" }]}>
      <Text style={{ color: colors.contentPrimary, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[
              styles.segmentChip,
              { backgroundColor: opt.value === value ? brandPrimary : colors.surface2 },
            ]}
          >
            <Text style={{ color: opt.value === value ? "#fff" : colors.contentPrimary, fontSize: 12, fontWeight: "600" }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginBottom: DSSpace.s2 },
  sectionCard: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, padding: DSSpace.s2 },
  hint: { fontSize: 11, paddingHorizontal: DSSpace.s3, paddingBottom: DSSpace.s2 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s3, paddingVertical: DSSpace.s3 },
  segmentChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  dangerRow: { marginHorizontal: DSSpace.screenEdge, padding: DSSpace.cardPadding, borderRadius: DSRadius.card, alignItems: "center" },
  navRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s3, paddingVertical: DSSpace.s3 },
});
