import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { exportTripsCSV } from "@/core/export/csvExporter";
import { exportTripGPX } from "@/core/export/gpxExporter";
import { analyzeTrip, type TripAnalysis, type TripSample } from "@/core/trip/tripAnalysis";
import { TripMap } from "@/components/TripMap";
import { MetricChart } from "@/components/MetricChart";
import {
  buildTimeline,
  sensorSeries,
  summarizeSensors,
  type ProtectionEntry,
  type SensorSample,
  type SensorSummary,
  type TimelineEntry,
  type TripDiagnosticEvent,
} from "@/core/trip/tripDiagnostics";
import { TRIP_SENSOR_KEYS, tripSensor } from "@/core/trip/tripSensors";
import {
  compareToRoute,
  findSameRoute,
  verdictFor,
  type RouteComparison,
} from "@/core/trip/routeMatching";
import type { FreezeFrameValues } from "@/core/obd/freezeFrame";
import type { Trip } from "@/core/storage/models";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | undefined>();
  const [samples, setSamples] = useState<TripSample[]>([]);
  const [rawSamples, setRawSamples] = useState<SensorSample[]>([]);
  const [diagnostics, setDiagnostics] = useState<{
    events: TripDiagnosticEvent[];
    protection: ProtectionEntry[];
  }>({ events: [], protection: [] });
  const [history, setHistory] = useState<Trip[]>([]);

  useEffect(() => {
    if (!id) return;
    tripRepository.trip(id).then(setTrip);
    tripRepository.samples(id).then((rows) => {
      setSamples(rows);
      setRawSamples(rows);
    });
    tripRepository.diagnostics(id).then(setDiagnostics).catch(() => undefined);
    // Enough history to recognise a commute without loading a whole year.
    tripRepository.recentTrips(400).then(setHistory).catch(() => undefined);
  }, [id]);

  // Guard stored points: a malformed row must never reach the map layer.
  const route = useMemo(
    () =>
      (trip?.routeData ?? []).filter(
        (p) => p != null && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Number.isFinite(p.t)
      ),
    [trip]
  );

  const analysis: TripAnalysis | undefined = useMemo(() => {
    if (!trip || samples.length < 2) return undefined;
    return analyzeTrip(samples, route, { distanceKm: trip.distanceKm, fuelUsedL: trip.fuelUsedL });
  }, [trip, samples, route]);

  if (!trip) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  const hasRoute = route.length > 1;
  const hasHarsh = (analysis?.segments ?? []).some((s) => s.cls !== "normal");
  const timeline = buildTimeline(trip.startedAt, diagnostics.events, diagnostics.protection);
  // Only drives that already happened count as "usual" — a later one cannot be
  // part of what this trip is being measured against.
  const earlier = findSameRoute(trip, history.filter((t) => t.startedAt < trip.startedAt));
  const comparison = compareToRoute(trip, earlier);
  const sensors = summarizeSensors(rawSamples, TRIP_SENSOR_KEYS);

  const exportCSV = async () => {
    const uri = await exportTripsCSV([trip]);
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
  };
  const exportGPX = async () => {
    const uri = await exportTripGPX(trip);
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
  };
  const deleteTrip = async () => {
    await tripRepository.deleteTrip(trip.id);
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>
          {new Date(trip.startedAt).toLocaleString()}
        </Text>
      </View>

      {hasRoute && (
        <>
          <TripMap route={route} segments={analysis?.segments ?? []} stops={analysis?.stops ?? []} />
          <View style={styles.legend}>
            <LegendDot color={brandPrimary} label={t("trip.map.legendNormal")} />
            {hasHarsh && <LegendDot color={colors.semCritical} label={t("trip.map.legendHarsh")} />}
            {(analysis?.stops.length ?? 0) > 0 && (
              <LegendDot color={colors.semAttention} label={t("trip.map.legendStop")} />
            )}
          </View>
        </>
      )}

      <View style={[styles.grid, { paddingHorizontal: DSSpace.screenEdge }]}>
        <Stat label={t("trip.distance")} value={Formatters.distance(trip.distanceKm, settings)} />
        <Stat label={t("trip.average")} value={Formatters.consumption(trip.avgL100 || undefined, settings)} />
        <Stat label={t("unit.liter")} value={Formatters.liters(trip.fuelUsedL)} />
        <Stat label={t("metric.speed")} value={Formatters.speed(trip.maxSpeedKmh, settings)} />
        <Stat label={t("trip.duration")} value={Formatters.duration(trip.durationS)} />
        <Stat label={t("trip.score")} value={trip.scoreTotal != null ? Formatters.number(trip.scoreTotal, 0) : "--"} />
      </View>

      {analysis && (
        <Section title={t("trip.analysis.title")}>
          <AnalysisRow
            icon="traffic-light"
            tint={colors.semAttention}
            label={t("trip.analysis.traffic")}
            value={
              analysis.trafficWaitS >= 30
                ? t("trip.analysis.trafficValue", {
                    minutes: Math.max(1, Math.round(analysis.trafficWaitS / 60)),
                    stops: analysis.stops.length,
                  })
                : t("trip.analysis.none")
            }
          />
          <AnalysisRow
            icon="arrow-up-bold"
            tint={colors.semCritical}
            label={t("trip.analysis.harshAccel")}
            value={String(analysis.harshAccelCount)}
          />
          <AnalysisRow
            icon="arrow-down-bold"
            tint={colors.semCritical}
            label={t("trip.analysis.harshBrake")}
            value={String(analysis.harshBrakeCount)}
          />
          <AnalysisRow
            icon="fuel"
            tint={colors.semInfo}
            label={t("trip.analysis.idleFuel")}
            value={
              analysis.idleFuelL >= 0.005
                ? `${Formatters.liters(analysis.idleFuelL)} · %${Math.round(analysis.idleFuelShare * 100)}`
                : t("trip.analysis.none")
            }
          />
          {analysis.topBurn && (
            <AnalysisRow
              icon="fire"
              tint={colors.semAttention}
              label={t("trip.analysis.topBurn")}
              value={t("trip.analysis.topBurnValue", {
                time: new Date(analysis.topBurn.startT).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                speed: Math.round(analysis.topBurn.avgSpeedKmh),
              })}
              last
            />
          )}
        </Section>
      )}

      {analysis && analysis.tips.length > 0 && (
        <Section title={t("trip.tips.title")}>
          {analysis.tips.map((tip, i) => (
            <View key={tip.key} style={[styles.tipRow, i > 0 && { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <View
                style={[
                  styles.tipIcon,
                  { backgroundColor: withAlpha(tip.severity === "positive" ? colors.semNominal : brandPrimary, 0.14) },
                ]}
              >
                <MaterialCommunityIcons
                  name={tip.severity === "positive" ? "check-decagram" : "lightbulb-on-outline"}
                  size={17}
                  color={tip.severity === "positive" ? colors.semNominal : brandPrimary}
                />
              </View>
              <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 14, lineHeight: 20 }}>
                {t(tip.key, tip.params)}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {comparison && (
        <Section title={t("route.title")}>
          <RouteComparisonRows comparison={comparison} trip={trip} />
        </Section>
      )}

      {timeline.length > 0 && (
        <Section title={t("trip.diagnostics.title")}>
          {timeline.map((entry, i) => (
            <TimelineRow key={`${entry.t}-${entry.kind}-${entry.code ?? entry.type ?? i}`} entry={entry} last={i === timeline.length - 1} />
          ))}
        </Section>
      )}

      {sensors.length > 0 && (
        <Section title={t("trip.sensors.title")}>
          {sensors.map((summary, i) => (
            <SensorRow
              key={summary.key}
              summary={summary}
              samples={rawSamples}
              last={i === sensors.length - 1}
            />
          ))}
        </Section>
      )}

      {trip.note ? (
        <View style={[styles.noteCard, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary }}>{trip.note}</Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.s3, marginTop: DSSpace.s4 }}>
        <ActionRow icon="file-delimited-outline" tint={brandPrimary} label={t("trip.exportCSV")} onPress={exportCSV} />
        {hasRoute && <ActionRow icon="map-marker-path" tint={brandPrimary} label={t("trip.exportGPX")} onPress={exportGPX} />}
        <ActionRow icon="trash-can-outline" tint={colors.semCritical} label={t("common.delete")} onPress={deleteTrip} destructive />
      </View>
    </ScrollView>
  );
}

/** How this drive sat against the same route's usual. */
function RouteComparisonRows({ comparison, trip }: { comparison: RouteComparison; trip: Trip }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();

  const fuelVerdict = verdictFor(comparison.consumptionDelta);
  const timeVerdict = verdictFor(comparison.durationDelta);

  const tintFor = (verdict: string) =>
    verdict === "better" ? colors.semNominal : verdict === "worse" ? colors.semAttention : colors.contentSecondary;

  const percent = (delta: number) => `${delta > 0 ? "+" : ""}${Math.round(delta * 100)}%`;

  return (
    <>
      <AnalysisRow
        icon="map-marker-path"
        tint={brandPrimary}
        label={t("route.basis")}
        value={t("route.basisValue", { count: comparison.sampleCount })}
      />
      <AnalysisRow
        icon={fuelVerdict === "better" ? "trending-down" : fuelVerdict === "worse" ? "trending-up" : "trending-neutral"}
        tint={tintFor(fuelVerdict)}
        label={t("route.consumption")}
        value={t(`route.verdict.${fuelVerdict}`, {
          delta: percent(comparison.consumptionDelta),
          usual: Formatters.consumption(comparison.usualL100, settings),
        })}
      />
      <AnalysisRow
        icon="clock-outline"
        tint={tintFor(timeVerdict)}
        label={t("route.duration")}
        value={t(`route.verdict.${timeVerdict}`, {
          delta: percent(comparison.durationDelta),
          usual: Formatters.duration(comparison.usualDurationS),
        })}
        last={!comparison.isBest}
      />
      {comparison.isBest && (
        <AnalysisRow
          icon="trophy-outline"
          tint={colors.semNominal}
          label={t("route.best")}
          value={Formatters.consumption(trip.avgL100, settings)}
          last
        />
      )}
    </>
  );
}

/** One moment from the drive. A code carries the ECU's freeze frame, which is
 * the whole reason the event is worth keeping, so it opens in place. */
function TimelineRow({ entry, last }: { entry: TimelineEntry; last: boolean }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const frameRows = entry.freezeFrame ? freezeFrameRows(entry.freezeFrame) : [];
  const expandable = frameRows.length > 0;

  const tint =
    entry.kind === "code" || entry.kind === "milOn"
      ? colors.semCritical
      : entry.kind === "protection"
        ? colors.semAttention
        : colors.contentSecondary;

  const icon: IconName =
    entry.kind === "code"
      ? "alert-circle-outline"
      : entry.kind === "milOff"
        ? "engine-off-outline"
        : entry.kind === "protection"
          ? "shield-alert-outline"
          : "engine-outline";

  const title =
    entry.kind === "code"
      ? t("trip.diagnostics.codeSet", { code: entry.code })
      : entry.kind === "protection"
        ? t(`care.event.${entry.type}`, { defaultValue: entry.type ?? "" })
        : t(`trip.diagnostics.${entry.kind}`);

  const subtitle = [
    t("trip.diagnostics.at", { time: formatOffset(entry.offsetS) }),
    entry.status ? t(`dtc.status.${entry.status}`, { defaultValue: entry.status }) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={[styles.timelineRow, !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Pressable
        onPress={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <View style={[styles.tipIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
          <MaterialCommunityIcons name={icon} size={17} color={tint} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 14, fontWeight: "600" }}>{title}</Text>
          <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>{subtitle}</Text>
        </View>
        {expandable && (
          <MaterialCommunityIcons
            name={open ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.contentTertiary}
          />
        )}
      </Pressable>

      {open && (
        <View style={{ marginTop: DSSpace.s3, paddingLeft: 40 }}>
          <Text style={{ color: colors.contentSecondary, fontSize: 12, marginBottom: DSSpace.s2 }}>
            {t("trip.diagnostics.freezeFrame")}
          </Text>
          {frameRows.map(([labelKey, value]) => (
            <View key={labelKey} style={styles.frameRow}>
              <Text style={{ color: colors.contentTertiary, fontSize: 12, flex: 1 }}>{t(labelKey)}</Text>
              <Text style={{ color: colors.contentPrimary, fontSize: 12, fontVariant: ["tabular-nums"] }}>{value}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** A sensor's range over the trip, opening into the trace behind it. */
function SensorRow({
  summary,
  samples,
  last,
}: {
  summary: SensorSummary;
  samples: SensorSample[];
  last: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const [open, setOpen] = useState(false);

  const sensor = tripSensor(summary.key);
  if (!sensor) return null;

  const unit = t(sensor.unitKey(settings));
  const show = (raw: number) => `${Formatters.number(sensor.convert(raw, settings), sensor.precision)} ${unit}`;
  const series = open
    ? sensorSeries(samples, summary.key).map((s) => ({ t: s.t, value: sensor.convert(s.value, settings) }))
    : [];

  return (
    <View style={[styles.timelineRow, !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 14, fontWeight: "600" }}>{t(sensor.labelKey)}</Text>
          <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>
            {t("trip.sensors.range", { min: show(summary.min), avg: show(summary.avg), max: show(summary.max) })}
          </Text>
        </View>
        <MaterialCommunityIcons
          name={open ? "chevron-up" : "chart-line-variant"}
          size={18}
          color={colors.contentTertiary}
        />
      </Pressable>

      {open && (
        <View style={{ marginTop: DSSpace.s3 }}>
          <MetricChart
            samples={series}
            color={brandPrimary}
            height={160}
            formatValue={(value) => `${Formatters.number(value, sensor.precision)} ${unit}`}
            emptyText={t("trip.sensors.tooShort")}
          />
        </View>
      )}
    </View>
  );
}

/** Freeze-frame fields that carry a reading, as label key / formatted value. */
function freezeFrameRows(frame: FreezeFrameValues): Array<[string, string]> {
  const rows: Array<[string, string | undefined]> = [
    ["metric.rpm", frame.rpm != null ? `${Formatters.number(frame.rpm, 0)} rpm` : undefined],
    ["metric.speed", frame.speedKmh != null ? `${Formatters.number(frame.speedKmh, 0)} km/h` : undefined],
    ["metric.coolant", frame.coolantC != null ? `${Formatters.number(frame.coolantC, 0)} °C` : undefined],
    ["metric.engineLoad", frame.engineLoadPct != null ? `${Formatters.number(frame.engineLoadPct, 0)} %` : undefined],
    ["metric.throttle", frame.throttlePct != null ? `${Formatters.number(frame.throttlePct, 0)} %` : undefined],
    ["metric.intakeAir", frame.intakeAirC != null ? `${Formatters.number(frame.intakeAirC, 0)} °C` : undefined],
    ["metric.map", frame.mapKpa != null ? `${Formatters.number(frame.mapKpa, 0)} kPa` : undefined],
    ["metric.maf", frame.mafGs != null ? `${Formatters.number(frame.mafGs, 1)} g/s` : undefined],
    ["metric.fuelTrimShort", frame.fuelTrimShortPct != null ? `${Formatters.number(frame.fuelTrimShortPct, 1)} %` : undefined],
    ["metric.fuelTrimLong", frame.fuelTrimLongPct != null ? `${Formatters.number(frame.fuelTrimLongPct, 1)} %` : undefined],
  ];
  return rows.filter((row): row is [string, string] => row[1] != null);
}

function formatOffset(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: DSSpace.s5 }}>
      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface1 }]}>{children}</View>
    </View>
  );
}

function AnalysisRow({
  icon,
  tint,
  label,
  value,
  last,
}: {
  icon: IconName;
  tint: string;
  label: string;
  value: string;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && { borderBottomColor: colors.hairline, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <View style={[styles.rowIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
        <MaterialCommunityIcons name={icon} size={17} color={tint} />
      </View>
      <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 15, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={{ color: colors.contentSecondary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function ActionRow({
  icon,
  tint,
  label,
  onPress,
  destructive,
}: {
  icon: IconName;
  tint: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.actionRow, { backgroundColor: colors.surface1 }]}>
      <MaterialCommunityIcons name={icon} size={18} color={tint} />
      <Text style={{ color: destructive ? tint : colors.contentPrimary, marginLeft: DSSpace.s2, fontSize: 15 }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 20, fontWeight: "700", flex: 1 },
  legend: {
    flexDirection: "row",
    gap: DSSpace.s4,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: -DSSpace.s1,
    marginBottom: DSSpace.s2,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: DSSpace.cardGap },
  stat: { width: "47%", padding: DSSpace.cardPadding, borderRadius: DSRadius.tile },
  sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4, paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginBottom: DSSpace.s2 },
  sectionCard: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: DSSpace.s3, paddingHorizontal: DSSpace.s4, paddingVertical: 13 },
  rowIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  timelineRow: { paddingVertical: DSSpace.s3 },
  frameRow: { flexDirection: "row", alignItems: "center", paddingVertical: 2 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: DSSpace.s3, paddingHorizontal: DSSpace.s4, paddingVertical: 13 },
  tipIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", marginTop: 1 },
  noteCard: { margin: DSSpace.screenEdge, marginBottom: 0, padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  actionRow: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface1 }]}>
      <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}
