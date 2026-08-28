import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { eq } from "drizzle-orm";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { db } from "@/core/storage/db";
import { dtcRecords } from "@/core/storage/schema";
import type { FreezeFrameValues } from "@/core/obd/freezeFrame";

/**
 * The ECU's own snapshot from the moment the fault set (Mode 02), stored at scan
 * time. This used to render the *live* values captured while scanning, which is
 * a different thing entirely and made the screen misleading.
 */
export default function FreezeFrameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [frame, setFrame] = useState<FreezeFrameValues | undefined>();
  const [capturedAt, setCapturedAt] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    db.select()
      .from(dtcRecords)
      .where(eq(dtcRecords.code, code))
      .then((rows) => {
        const withFrame = rows.find((r) => r.freezeFrameJSON);
        if (withFrame?.freezeFrameJSON) {
          try {
            setFrame(JSON.parse(withFrame.freezeFrameJSON) as FreezeFrameValues);
            setCapturedAt(withFrame.seenAt);
          } catch {
            setFrame(undefined);
          }
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [code]);

  const rows: Array<{ label: string; value: string }> = frame
    ? [
        { label: t("metric.rpm"), value: Formatters.rpm(frame.rpm) },
        { label: t("metric.speed"), value: Formatters.speed(frame.speedKmh, settings) },
        { label: t("metric.coolant"), value: Formatters.temperature(frame.coolantC, settings) },
        { label: t("metric.engineLoad"), value: Formatters.percent(frame.engineLoadPct) },
        { label: t("metric.throttle"), value: Formatters.percent(frame.throttlePct) },
        { label: t("metric.intakeAir"), value: Formatters.temperature(frame.intakeAirC, settings) },
        { label: t("metric.map"), value: frame.mapKpa != null ? `${Formatters.number(frame.mapKpa, 0)} kPa` : "--" },
        { label: t("metric.maf"), value: frame.mafGs != null ? `${Formatters.number(frame.mafGs, 1)} g/s` : "--" },
        { label: t("metric.fuelTrimShort"), value: Formatters.percent(frame.fuelTrimShortPct) },
        { label: t("metric.fuelTrimLong"), value: Formatters.percent(frame.fuelTrimLongPct) },
      ].filter((r) => r.value !== "--")
    : [];

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("freezeFrame.title")}</Text>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge }}>
        <Text style={{ color: colors.contentPrimary, fontSize: 26, fontWeight: "700" }}>{code}</Text>
        <Text style={{ color: colors.contentSecondary, fontSize: 13, marginTop: 2, marginBottom: DSSpace.s4 }}>
          {t("freezeFrame.subtitle")}
        </Text>
      </View>

      {loading ? null : rows.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="camera-off-outline" size={22} color={colors.contentTertiary} />
          <Text style={{ color: colors.contentSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
            {t("freezeFrame.empty")}
          </Text>
        </View>
      ) : (
        <>
          {frame?.triggerCode && frame.triggerCode !== code && (
            <View style={[styles.noticeCard, { backgroundColor: colors.surface1 }]}>
              <MaterialCommunityIcons name="information-outline" size={16} color={colors.semAttention} />
              <Text style={{ color: colors.contentSecondary, fontSize: 12, flex: 1 }}>
                {t("freezeFrame.otherTrigger", { code: frame.triggerCode })}
              </Text>
            </View>
          )}
          <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
            {rows.map((r, i) => (
              <View
                key={r.label}
                style={[styles.row, i > 0 && { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth }]}
              >
                <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{r.label}</Text>
                <Text style={{ color: colors.contentSecondary, fontSize: 15, fontVariant: ["tabular-nums"] }}>
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
          {capturedAt != null && (
            <Text style={[styles.footnote, { color: colors.contentTertiary }]}>
              {t("freezeFrame.capturedAt", { date: new Date(capturedAt).toLocaleString() })}
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s3 },
  title: { fontSize: 22, fontWeight: "700" },
  card: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s4, paddingVertical: 13 },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s3,
    marginHorizontal: DSSpace.screenEdge,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  noticeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s2,
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.s3,
    borderRadius: DSRadius.tile,
  },
  footnote: { fontSize: 11, paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginTop: DSSpace.s2 },
});
