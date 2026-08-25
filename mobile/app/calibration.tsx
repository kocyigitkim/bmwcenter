import React, { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { fuelCalibrator } from "@/core/fuel/fuelCalibrator";
import { speedCalibrator } from "@/core/analysis/speedCalibrator";

const REQUIRED_SAMPLES = 2;

export default function CalibrationScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [acceptedCount, setAcceptedCount] = useState(0);

  const reload = useCallback(() => {
    fuelCalibrator.acceptedSampleCount().then(setAcceptedCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  useEffect(() => {
    fuelCalibrator.evaluateLatestFullTankPair().then(reload);
  }, [reload]);

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("calibration.title")}</Text>
      </View>

      <Section title={t("calibration.fuelFactor")}>
        {acceptedCount < REQUIRED_SAMPLES ? (
          <Text style={{ color: colors.contentSecondary, padding: DSSpace.cardPadding }}>
            {t("calibration.collecting", { count: acceptedCount, required: REQUIRED_SAMPLES })}
          </Text>
        ) : (
          <Row label={t("calibration.fuelFactor")} value={settings.fuelCalibrationFactor.toFixed(3)} />
        )}
        <Pressable
          onPress={() => fuelCalibrator.reset().then(reload)}
          style={[styles.resetButton, { borderColor: colors.semCritical }]}
        >
          <Text style={{ color: colors.semCritical, fontWeight: "600" }}>{t("calibration.reset")}</Text>
        </Pressable>
      </Section>

      <Section title={t("calibration.speedFactor")}>
        <Row label={t("calibration.speedFactor")} value={settings.speedCalibrationFactor.toFixed(3)} />
        <View style={styles.switchRow}>
          <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t("calibration.applySpeed")}</Text>
          <Switch value={settings.applySpeedCorrection} onValueChange={(v) => settings.set("applySpeedCorrection", v)} />
        </View>
        <Pressable
          onPress={() => {
            speedCalibrator.reset();
          }}
          style={[styles.resetButton, { borderColor: colors.semCritical }]}
        >
          <Text style={{ color: colors.semCritical, fontWeight: "600" }}>{t("calibration.reset")}</Text>
        </Pressable>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s5 }}>
      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface1 }]}>{children}</View>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.contentPrimary, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.contentSecondary, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginBottom: DSSpace.s2 },
  sectionCard: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, padding: DSSpace.s2 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s3, paddingVertical: DSSpace.s3 },
  switchRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s3, paddingVertical: DSSpace.s2 },
  resetButton: { margin: DSSpace.s3, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: "center" },
});
