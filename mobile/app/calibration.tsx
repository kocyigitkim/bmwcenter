import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { fuelCalibrator } from "@/core/fuel/fuelCalibrator";
import { speedCalibrator } from "@/core/analysis/speedCalibrator";
import { useCalibrationStatus } from "@/core/calibration/useCalibrationStatus";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export default function CalibrationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const { fuel, speed, reload } = useCalibrationStatus();

  const fuelDone = fuel?.isCalibrated ?? false;
  const speedDone = speed.isCalibrated;

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("calibration.title")}</Text>
      </View>

      <Text style={[styles.intro, { color: colors.contentSecondary }]}>{t("calibration.intro")}</Text>

      {/* ---- Fuel ---- */}
      <Section
        icon="gas-station"
        tint={brandPrimary}
        title={t("calibration.fuel.title")}
        chip={
          fuelDone
            ? { label: t("calibration.done"), color: colors.semNominal }
            : { label: t("calibration.progressChip", { count: fuel?.acceptedCount ?? 0, total: fuel?.requiredCount ?? 2 }), color: colors.semAttention }
        }
      >
        <Text style={[styles.body, { color: colors.contentSecondary }]}>{t("calibration.fuel.how")}</Text>
        <Step index={1} text={t("calibration.fuel.step1")} />
        <Step index={2} text={t("calibration.fuel.step2")} />
        <Step index={3} text={t("calibration.fuel.step3")} />

        {fuel?.lastSample && !fuel.lastSample.accepted && fuel.lastSample.rejection && (
          <View style={[styles.notice, { backgroundColor: withAlpha(colors.semAttention, 0.12) }]}>
            <MaterialCommunityIcons name="information-outline" size={15} color={colors.semAttention} />
            <Text style={{ color: colors.contentPrimary, fontSize: 13, flex: 1 }}>
              {t(`calibration.fuel.rejected.${fuel.lastSample.rejection}`, {
                km: Math.round(fuel.lastSample.distanceKm),
                liters: fuel.lastSample.calculatedL.toFixed(1),
              })}
            </Text>
          </View>
        )}

        <ValueRow label={t("calibration.factor")} value={settings.fuelCalibrationFactor.toFixed(3)} />
        <ResetButton onPress={() => fuelCalibrator.reset().then(reload)} />
      </Section>

      {/* ---- Speed ---- */}
      <Section
        icon="speedometer"
        tint={colors.semInfo}
        title={t("calibration.speed.title")}
        chip={
          speedDone
            ? { label: t("calibration.done"), color: colors.semNominal }
            : { label: t("calibration.progressChip", { count: speed.sampleCount, total: speed.requiredSamples }), color: colors.semAttention }
        }
      >
        <Text style={[styles.body, { color: colors.contentSecondary }]}>{t("calibration.speed.how")}</Text>

        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack, { backgroundColor: colors.surface2 }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(speed.progress * 100)}%` as `${number}%`, backgroundColor: speedDone ? colors.semNominal : brandPrimary },
              ]}
            />
          </View>
          <Text style={{ color: colors.contentTertiary, fontSize: 11, marginTop: 4 }}>
            {t("calibration.speed.samples", { count: speed.sampleCount, total: speed.requiredSamples })}
          </Text>
        </View>

        <ValueRow label={t("calibration.factor")} value={settings.speedCalibrationFactor.toFixed(3)} />
        <View style={styles.switchRow}>
          <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{t("calibration.applySpeed")}</Text>
          <Switch value={settings.applySpeedCorrection} onValueChange={(v) => settings.set("applySpeedCorrection", v)} />
        </View>
        <ResetButton
          onPress={() => {
            speedCalibrator.reset();
            reload();
          }}
        />
      </Section>
    </ScrollView>
  );
}

function Section({
  icon,
  tint,
  title,
  chip,
  children,
}: {
  icon: IconName;
  tint: string;
  title: string;
  chip: { label: string; color: string };
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s5 }}>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface1 }]}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIcon, { backgroundColor: withAlpha(tint, 0.14) }]}>
            <MaterialCommunityIcons name={icon} size={18} color={tint} />
          </View>
          <Text style={[styles.sectionTitle, { color: colors.contentPrimary }]}>{title}</Text>
          <View style={[styles.chip, { backgroundColor: withAlpha(chip.color, 0.14) }]}>
            <Text style={{ color: chip.color, fontSize: 11, fontWeight: "700" }}>{chip.label}</Text>
          </View>
        </View>
        {children}
      </View>
    </View>
  );
}

function Step({ index, text }: { index: number; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stepRow}>
      <View style={[styles.stepBadge, { backgroundColor: withAlpha(brandPrimary, 0.14) }]}>
        <Text style={{ color: brandPrimary, fontSize: 11, fontWeight: "700" }}>{index}</Text>
      </View>
      <Text style={{ color: colors.contentPrimary, fontSize: 14, flex: 1, lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.valueRow, { borderTopColor: colors.hairline }]}>
      <Text style={{ color: colors.contentPrimary, flex: 1, fontSize: 15 }}>{label}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 15, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

function ResetButton({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={styles.resetButton}>
      <Text style={{ color: colors.semCritical, fontWeight: "600", fontSize: 14 }}>{t("calibration.reset")}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s2 },
  title: { fontSize: 22, fontWeight: "700" },
  intro: { fontSize: 13, lineHeight: 18, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  sectionCard: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, padding: DSSpace.cardPadding },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, marginBottom: DSSpace.s3 },
  sectionIcon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  body: { fontSize: 13, lineHeight: 18, marginBottom: DSSpace.s3 },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: DSSpace.s2, marginBottom: DSSpace.s2 },
  stepBadge: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 1 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 6, borderRadius: 12, padding: DSSpace.s3, marginTop: DSSpace.s2, marginBottom: DSSpace.s2 },
  progressWrap: { marginTop: DSSpace.s2, marginBottom: DSSpace.s2 },
  progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 8, borderRadius: 4 },
  valueRow: { flexDirection: "row", alignItems: "center", paddingVertical: DSSpace.s3, borderTopWidth: StyleSheet.hairlineWidth, marginTop: DSSpace.s2 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingVertical: DSSpace.s2 },
  resetButton: { alignItems: "center", paddingVertical: DSSpace.s2, marginTop: DSSpace.s1 },
});
