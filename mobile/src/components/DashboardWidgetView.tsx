import React from "react";
import { View, Text, StyleSheet, Pressable, type StyleProp, type ViewStyle } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GaugeRing, type GaugeSize } from "./GaugeRing";
import { MetricTile } from "./MetricTile";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import * as GZ from "@/design/gaugeZone";
import { Formatters, unavailable } from "@/design/formatters";
import { useOBDStore } from "@/core/obd/obdService";
import { useAppSettings } from "@/core/settings/appSettings";
import { useTripRepositorySummary } from "@/hooks/useTripRepositorySummary";
import { useCareCoordinator } from "@/core/care/careCoordinator";
import {
  icon as widgetIcon,
  titleKey,
  alwaysRendersGauge,
  rendersGaugeWhenHero,
  type DashboardWidgetKind,
} from "@/core/dashboard/dashboardWidgetKind";
import type { DashboardWidgetItem } from "@/core/dashboard/dashboardLayout";
import * as DM from "@/core/dashboard/dashMetrics";
import * as FC from "@/core/fuel/fuelCalculator";
import { isGraphable } from "@/core/metrics/widgetMetric";

export type Placement = "gridCell" | "heroFull" | "heroDual";

interface Props {
  item: DashboardWidgetItem;
  placement: Placement;
  isEditing?: boolean;
}

export function DashboardWidgetView({ item, placement, isEditing = false }: Props) {
  const { t } = useTranslation();
  const snapshot = useOBDStore((s) => s.snapshot);
  const connection = useOBDStore((s) => s.connection);
  const settings = useAppSettings();
  const router = useRouter();
  const connected = connection.status === "connected";
  const caption = t(titleKey[item.id]);
  const icon = (widgetIcon[item.id] ?? "help-circle") as keyof typeof MaterialCommunityIcons.glyphMap;

  const gaugeSize: GaugeSize = placement === "gridCell" ? "compact" : "hero";
  const usesGauge = alwaysRendersGauge(item.id) || (item.size === "hero" && rendersGaugeWhenHero(item.id));

  if (item.id === "vehicleScan") {
    return (
      <ActionCard
        icon="stethoscope"
        title={t("scan.action", { defaultValue: "Scan Vehicle" })}
        subtitle={t("scan.dashboardHint", { defaultValue: "Check diagnostic codes and readiness" })}
        isEditing={isEditing}
        onPress={() => router.push("/scan")}
      />
    );
  }
  if (item.id === "parking") {
    return (
      <ActionCard
        icon="map-marker"
        title={t("parking.findCar", { defaultValue: "Find my car" })}
        subtitle={t("dashboard.parkingEmpty", { defaultValue: "No saved parking location" })}
        isEditing={isEditing}
        onPress={() => router.push("/parking")}
      />
    );
  }
  if (item.id === "dailyFuel") {
    return <DailyFuelCard isEditing={isEditing} onPress={() => router.push("/(tabs)/fuel")} />;
  }

  if (usesGauge) {
    const spec = gaugeSpec(item.id, snapshot, settings, connected, caption);
    return (
      <GraphableWrap kind={item.id} isEditing={isEditing} style={styles.gaugeWrap}>
        <GaugeRing
          value={spec.value}
          range={spec.range}
          zones={spec.zones}
          unit={t(spec.unitKey)}
          caption={spec.caption}
          size={gaugeSize}
          precision={spec.precision}
          unavailableReason={t(spec.emptyReasonKey)}
        />
      </GraphableWrap>
    );
  }

  const spec = tileSpec(item.id, snapshot, settings, connected, caption, icon, t);
  return (
    <GraphableWrap kind={item.id} isEditing={isEditing} style={{ flex: 1 }}>
      <MetricTile {...spec} emptyReason={spec.emptyReason ? t(spec.emptyReason) : undefined} />
    </GraphableWrap>
  );
}

/**
 * Opens a widget backed by a single PID into its live graph.
 *
 * Widgets that are computed from several readings are not in the history, so
 * they stay inert rather than opening an empty chart. The corner mark is what
 * tells the two apart — without it, tapping is a feature nobody finds.
 */
function GraphableWrap({
  kind,
  isEditing,
  style,
  children,
}: {
  kind: DashboardWidgetKind;
  isEditing: boolean;
  style: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const graphable = isGraphable(kind);

  return (
    <Pressable
      style={style}
      disabled={isEditing || !graphable}
      onPress={() => router.push(`/metric/${kind}`)}
    >
      {children}
      {graphable && !isEditing && (
        <MaterialCommunityIcons
          name="chart-line-variant"
          size={13}
          color={colors.contentTertiary}
          style={graphMarkStyle}
        />
      )}
    </Pressable>
  );
}

const graphMarkStyle = { position: "absolute" as const, top: 6, right: 6, opacity: 0.5 };

function ActionCard({
  icon,
  title,
  subtitle,
  isEditing,
  onPress,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle: string;
  isEditing: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <MaterialCommunityIcons name={icon} size={28} color={brandPrimary} />
      <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
        <Text style={[styles.cardTitle, { color: colors.contentPrimary }]}>{title}</Text>
        <Text style={[styles.cardSubtitle, { color: colors.contentSecondary }]}>{subtitle}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.contentTertiary} />
    </View>
  );
  if (isEditing) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

function DailyFuelCard({ isEditing, onPress }: { isEditing: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const currencyCode = useAppSettings((s) => s.currencyCode);
  const summary = useTripRepositorySummary("today");

  const subtitle =
    summary.fuelUsedL > 0
      ? t("dashboard.dailyFuel.avgCost", { value: Formatters.currency(summary.estimatedCost, currencyCode) })
      : t("dashboard.dailyFuel.noSpend");

  const content = (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <MaterialCommunityIcons name="gas-station" size={28} color={brandPrimary} />
      <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
        <Text style={[styles.cardTitle, { color: colors.contentPrimary }]}>{t("dashboard.dailyFuel.title")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
          <Text style={[styles.cardValue, { color: colors.contentPrimary }]}>{Formatters.liters(summary.fuelUsedL)}</Text>
          <Text style={{ color: colors.contentTertiary }}>·</Text>
          <Text style={[styles.cardSubtitle, { color: colors.contentSecondary }]}>{subtitle}</Text>
        </View>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.contentTertiary} />
    </View>
  );
  if (isEditing) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

interface GaugeSpec {
  value?: number;
  range: [number, number];
  zones: GZ.GaugeZone[];
  unitKey: string;
  caption: string;
  precision: number;
  emptyReasonKey: string;
}

function gaugeSpec(
  id: DashboardWidgetKind,
  snapshot: ReturnType<typeof useOBDStore.getState>["snapshot"],
  settings: ReturnType<typeof useAppSettings.getState>,
  connected: boolean,
  caption: string
): GaugeSpec {
  const base = { caption, emptyReasonKey: "data.noData" };
  switch (id) {
    case "speed": {
      const value = DM.displaySpeed(snapshot.speedKmh, settings);
      return { ...base, value, range: [0, 220], zones: GZ.speedZones(), unitKey: DM.speedUnitKey(settings), precision: 0 };
    }
    case "rpm":
      return { ...base, value: snapshot.rpm, range: [0, 7000], zones: GZ.rpmZones(), unitKey: "unit.rpm", precision: 0 };
    case "coolant": {
      const value = DM.displayTemp(snapshot.coolantC, settings);
      return {
        ...base,
        value,
        range: DM.tempRange(settings),
        zones: GZ.coolantZones(settings.temperatureUnit === "celsius"),
        unitKey: DM.tempUnitKey(settings),
        precision: 0,
      };
    }
    case "oilTemp": {
      const value = DM.displayTemp(snapshot.oilTempC, settings);
      return {
        ...base,
        value,
        range: DM.tempRange(settings),
        zones: GZ.coolantZones(settings.temperatureUnit === "celsius"),
        unitKey: DM.tempUnitKey(settings),
        precision: 0,
        emptyReasonKey: "data.oilExtendedHint",
      };
    }
    case "boost": {
      const value = DM.boostValue(snapshot, settings);
      const range = DM.boostRange(settings);
      return { ...base, value, range, zones: [{ from: range[0], to: 0, semantic: "cold" }, { from: 0, to: range[1] * 0.55, semantic: "nominal" }, { from: range[1] * 0.55, to: range[1], semantic: "attention" }], unitKey: DM.boostUnitKey(settings), precision: settings.pressureUnit === "kpa" ? 0 : 2 };
    }
    case "voltage":
      return { ...base, value: snapshot.voltage, range: [10, 16], zones: GZ.voltageZones(), unitKey: "unit.volt", precision: 1 };
    case "engineLoad":
      return { ...base, value: snapshot.engineLoadPct, range: [0, 100], zones: GZ.percentZones(), unitKey: "unit.percent", precision: 0 };
    case "transmissionOilTemp": {
      const value = DM.displayTemp(snapshot.transmissionOilTempC, settings);
      return {
        ...base,
        value,
        range: DM.tempRange(settings),
        zones: GZ.coolantZones(settings.temperatureUnit === "celsius"),
        unitKey: DM.tempUnitKey(settings),
        precision: 0,
      };
    }
    case "fuelRail":
      return {
        ...base,
        value: snapshot.fuelRailBar,
        range: [0, 200],
        zones: [
          { from: 0, to: 50, semantic: "attention" },
          { from: 50, to: 170, semantic: "nominal" },
          { from: 170, to: 200, semantic: "attention" },
        ],
        unitKey: "unit.bar",
        precision: 0,
      };
    default:
      return { ...base, value: undefined, range: [0, 100], zones: [], unitKey: "unit.percent", precision: 0 };
  }
}

interface TileSpecResult {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  valueText?: string;
  unit: string;
  variant: "value" | "valueBar" | "valueTrend" | "empty";
  emptyReason?: string;
  progress?: number;
  zones?: GZ.GaugeZone[];
  range?: [number, number];
  value?: number;
  trend?: number[];
}

function tileSpec(
  id: DashboardWidgetKind,
  snapshot: ReturnType<typeof useOBDStore.getState>["snapshot"],
  settings: ReturnType<typeof useAppSettings.getState>,
  connected: boolean,
  label: string,
  icon: keyof typeof MaterialCommunityIcons.glyphMap,
  t: (key: string) => string
): TileSpecResult {
  const notSupported = unavailable();
  switch (id) {
    case "fuelLevel":
      return {
        label,
        icon,
        valueText: snapshot.fuelLevelPct != null ? Formatters.number(snapshot.fuelLevelPct, 0) : undefined,
        unit: "%",
        variant: "valueBar",
        progress: (snapshot.fuelLevelPct ?? 0) / 100,
        zones: GZ.fuelZones(),
        range: [0, 100],
        value: snapshot.fuelLevelPct,
      };
    case "range": {
      const rate = FC.fuelRateLh(snapshot, settings.fuelType, settings.displacementL, settings.volumetricEfficiency, settings.fuelCalibrationFactor);
      const { l100 } = FC.instantL100(rate, snapshot.speedKmh);
      const km = DM.rangeKm(snapshot, l100, settings.tankCapacityL);
      return {
        label,
        icon,
        valueText: km != null ? Formatters.distance(km, settings) : undefined,
        unit: settings.unitSystem === "metric" ? "km" : "mi",
        variant: "value",
      };
    }
    case "instantConsumption": {
      const rate = FC.fuelRateLh(snapshot, settings.fuelType, settings.displacementL, settings.volumetricEfficiency, settings.fuelCalibrationFactor);
      const { l100, idleLh } = FC.instantL100(rate, snapshot.speedKmh);
      const text = Formatters.consumption(l100, settings, idleLh, snapshot.speedKmh);
      return {
        label,
        icon,
        valueText: text === notSupported ? undefined : text,
        unit: t(DM.instantUnitKey(snapshot, idleLh, settings)),
        variant: "valueTrend",
      };
    }
    case "throttle":
      return {
        label,
        icon,
        valueText: snapshot.throttlePct != null ? Formatters.number(snapshot.throttlePct, 0) : undefined,
        unit: "%",
        variant: "valueBar",
        progress: (snapshot.throttlePct ?? 0) / 100,
        zones: GZ.percentZones(),
        range: [0, 100],
        value: snapshot.throttlePct,
      };
    case "batterySoc":
      return {
        label,
        icon,
        valueText: snapshot.batterySocPct != null ? Formatters.number(snapshot.batterySocPct, 0) : undefined,
        unit: "%",
        variant: snapshot.batterySocPct == null ? "empty" : "valueBar",
        emptyReason: "data.extendedPending",
        progress: (snapshot.batterySocPct ?? 0) / 100,
        zones: GZ.fuelZones(),
        range: [0, 100],
        value: snapshot.batterySocPct,
      };
    case "coolant":
      return barTempTile(label, icon, snapshot.coolantC, settings);
    case "oilTemp":
      return barTempTile(label, icon, snapshot.oilTempC, settings);
    case "transmissionOilTemp":
      return barTempTile(label, icon, snapshot.transmissionOilTempC, settings);
    case "engineLoad":
      return percentBar(label, icon, snapshot.engineLoadPct);
    case "pedal":
      return percentBar(label, icon, snapshot.pedalPct);
    case "voltage":
      return {
        label,
        icon,
        valueText: snapshot.voltage != null ? Formatters.number(snapshot.voltage, 1) : undefined,
        unit: t("unit.volt"),
        variant: snapshot.voltage == null ? "empty" : "valueBar",
        progress: ((snapshot.voltage ?? 10) - 10) / 6,
        zones: GZ.voltageZones(),
        range: [10, 16],
        value: snapshot.voltage,
      };
    case "oilPressure":
      return {
        label,
        icon,
        valueText: snapshot.oilPressureBar != null ? Formatters.number(snapshot.oilPressureBar, 2) : undefined,
        unit: t("unit.bar"),
        variant: snapshot.oilPressureBar == null ? "empty" : "valueBar",
        emptyReason: "data.extendedPending",
        progress: snapshot.oilPressureBar != null ? Math.min(Math.max(snapshot.oilPressureBar / 6, 0), 1) : undefined,
        zones: GZ.percentZones(),
        range: [0, 6],
        value: snapshot.oilPressureBar,
      };
    case "ignitionAdvance":
      return simpleTile(label, icon, snapshot.timingAdvance != null ? Formatters.number(snapshot.timingAdvance, 1) : undefined, "°");
    case "catalyst":
      return simpleTile(label, icon, DM.temperatureText(snapshot.catalystC, settings), t(DM.tempUnitKey(settings)));
    case "stft":
      return simpleTile(label, icon, snapshot.stftBank1 != null ? Formatters.number(snapshot.stftBank1, 1) : undefined, "%");
    case "ltft":
      return simpleTile(label, icon, snapshot.ltftBank1 != null ? Formatters.number(snapshot.ltftBank1, 1) : undefined, "%");
    case "maf": {
      const kgh = snapshot.mafKgh ?? (snapshot.mafGs != null ? snapshot.mafGs * 3.6 : undefined);
      return simpleTile(label, icon, kgh != null ? Formatters.number(kgh, 1) : undefined, t("unit.kgh"));
    }
    case "map":
      return simpleTile(label, icon, snapshot.mapKpa != null ? Formatters.number(snapshot.mapKpa, 0) : undefined, t("unit.kpa"));
    case "iat":
      return simpleTile(label, icon, DM.temperatureText(snapshot.intakeAirC, settings), t(DM.tempUnitKey(settings)));
    case "fuelRail":
      return simpleTile(label, icon, snapshot.fuelRailBar != null ? Formatters.number(snapshot.fuelRailBar, 0) : undefined, t("unit.bar"), "data.extendedPending");
    case "lowPressureFuel":
      return simpleTile(label, icon, snapshot.lowPressureFuelBar != null ? Formatters.number(snapshot.lowPressureFuelBar, 2) : undefined, t("unit.bar"), "data.extendedPending");
    case "ecoScore": {
      const score = useCareCoordinator.getState().liveEcoScore;
      return { label, icon, valueText: Formatters.number(score, 0), unit: "", variant: "value", value: score };
    }
    case "boost": {
      const value = DM.boostValue(snapshot, settings);
      return simpleTile(label, icon, value != null ? Formatters.number(value, settings.pressureUnit === "kpa" ? 0 : 2) : undefined, t(DM.boostUnitKey(settings)), "data.extendedPending");
    }
    case "intercooler":
      return simpleTile(label, icon, DM.temperatureText(snapshot.intercoolerC, settings), t(DM.tempUnitKey(settings)), "data.extendedPending");
    case "radiatorOutlet":
      return simpleTile(label, icon, DM.temperatureText(snapshot.radiatorOutletC, settings), t(DM.tempUnitKey(settings)), "data.extendedPending");
    case "ambient":
      return simpleTile(label, icon, DM.temperatureText(snapshot.ambientC, settings), t(DM.tempUnitKey(settings)));
    case "alternatorVoltage": {
      const volts = snapshot.alternatorVoltage ?? snapshot.voltage;
      return simpleTile(label, icon, volts != null ? Formatters.number(volts, 1) : undefined, t("unit.volt"), snapshot.alternatorVoltage == null ? "data.extendedPending" : undefined);
    }
    case "vanosIntake":
      return simpleTile(label, icon, snapshot.vanosIntakeDeg != null ? Formatters.number(snapshot.vanosIntakeDeg, 1) : undefined, "°", "data.extendedPending");
    case "vanosExhaust":
      return simpleTile(label, icon, snapshot.vanosExhaustDeg != null ? Formatters.number(snapshot.vanosExhaustDeg, 1) : undefined, "°", "data.extendedPending");
    case "boostSetpoint":
      return simpleTile(label, icon, undefined, t(DM.boostUnitKey(settings)), "data.extendedPending");
    default:
      return { label, icon, valueText: undefined, unit: "", variant: "empty", emptyReason: "data.notSupported" };
  }
}

function simpleTile(
  label: string,
  icon: keyof typeof MaterialCommunityIcons.glyphMap,
  text: string | undefined,
  unit: string,
  emptyReasonKey?: string
): TileSpecResult {
  return {
    label,
    icon,
    valueText: text,
    unit,
    variant: text == null ? "empty" : "value",
    emptyReason: text == null ? (emptyReasonKey ?? "data.notSupported") : undefined,
  };
}

function barTempTile(
  label: string,
  icon: keyof typeof MaterialCommunityIcons.glyphMap,
  celsius: number | undefined,
  settings: ReturnType<typeof useAppSettings.getState>
): TileSpecResult {
  const value = DM.displayTemp(celsius, settings);
  const range = DM.tempRange(settings);
  return {
    label,
    icon,
    valueText: value != null ? Formatters.number(value, 0) : undefined,
    unit: settings.temperatureUnit === "celsius" ? "°C" : "°F",
    variant: value == null ? "empty" : "valueBar",
    progress: value != null ? DM.progress(value, range) : undefined,
    zones: GZ.coolantZones(settings.temperatureUnit === "celsius"),
    range,
    value,
  };
}

function percentBar(label: string, icon: keyof typeof MaterialCommunityIcons.glyphMap, value: number | undefined): TileSpecResult {
  return {
    label,
    icon,
    valueText: value != null ? Formatters.number(value, 0) : undefined,
    unit: "%",
    variant: value == null ? "empty" : "valueBar",
    progress: (value ?? 0) / 100,
    zones: GZ.percentZones(),
    range: [0, 100],
    value,
  };
}

const styles = StyleSheet.create({
  gaugeWrap: { alignItems: "center", padding: DSSpace.s2 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  cardTitle: { fontSize: 17, fontWeight: "600" },
  cardSubtitle: { fontSize: 11, fontWeight: "400" },
  cardValue: { fontSize: 13, fontWeight: "500" },
});
