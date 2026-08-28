import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { useCalibrationStatus } from "@/core/calibration/useCalibrationStatus";

/** Dashboard prompt shown until both calibrations finish, so accuracy work is
 * discovered instead of buried in settings. Dismissable; hides itself for good
 * once calibration completes. */
export function CalibrationPromptCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const router = useRouter();
  const dismissed = useAppSettings((s) => s.calibrationPromptDismissed);
  const set = useAppSettings((s) => s.set);
  const { fuel, speed, isComplete } = useCalibrationStatus(10_000);

  // Wait for the fuel status to load before deciding — a flash of the card on
  // every launch for calibrated users would be worse than a late appearance.
  if (dismissed || fuel == null || isComplete) return null;

  const fuelDone = fuel.isCalibrated;
  const speedDone = speed.isCalibrated;
  const subtitle = !fuelDone && !speedDone
    ? t("calibration.card.both")
    : !fuelDone
      ? t("calibration.card.fuelOnly")
      : t("calibration.card.speedOnly");

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1, borderColor: colors.hairline }]}>
      <View style={[styles.icon, { backgroundColor: withAlpha(brandPrimary, 0.14) }]}>
        <MaterialCommunityIcons name="tune-variant" size={20} color={brandPrimary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.cardTitle, { color: colors.contentPrimary }]}>{t("calibration.card.title")}</Text>
        <Text style={{ color: colors.contentSecondary, fontSize: 12, lineHeight: 16 }}>{subtitle}</Text>
        <Pressable onPress={() => router.push("/calibration")} style={styles.cta} hitSlop={6}>
          <Text style={{ color: brandPrimary, fontWeight: "700", fontSize: 13 }}>{t("calibration.card.action")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={brandPrimary} />
        </Pressable>
      </View>
      <Pressable onPress={() => set("calibrationPromptDismissed", true)} hitSlop={10} style={styles.close}>
        <MaterialCommunityIcons name="close" size={16} color={colors.contentTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: DSSpace.s3,
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  cta: { flexDirection: "row", alignItems: "center", marginTop: DSSpace.s2 },
  close: { padding: 2 },
});
