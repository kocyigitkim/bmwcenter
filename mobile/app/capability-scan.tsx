import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useOBDStore } from "@/core/obd/obdService";
import { useAppSettings } from "@/core/settings/appSettings";
import { resolveAllCapabilities, type CapabilityState } from "@/core/obd/capabilityResolver";

const STATE_COLOR: Record<CapabilityState, "semNominal" | "semCritical" | "semAttention"> = {
  supported: "semNominal",
  unsupported: "semCritical",
  unknown: "semAttention",
};

const STATE_ICON: Record<CapabilityState, keyof typeof MaterialCommunityIcons.glyphMap> = {
  supported: "check-circle",
  unsupported: "close-circle",
  unknown: "help-circle",
};

export default function CapabilityScanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const supportedPIDs = useOBDStore((s) => s.supportedPIDs);
  const vehiclePlatform = useAppSettings((s) => s.vehiclePlatform);
  const capabilities = resolveAllCapabilities(supportedPIDs.size > 0, vehiclePlatform);

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("settings.capabilities")}</Text>
      </View>
      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        {capabilities.map((cap) => {
          const colorKey = STATE_COLOR[cap.state];
          return (
            <View key={cap.feature} style={[styles.row, { backgroundColor: colors.surface1 }]}>
              <MaterialCommunityIcons name={STATE_ICON[cap.state]} size={22} color={colors[colorKey]} />
              <View style={{ marginLeft: DSSpace.s3, flex: 1 }}>
                <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>
                  {t(`capability.${cap.feature}`, { defaultValue: cap.feature })}
                </Text>
                {cap.detail ? <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{cap.detail}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
