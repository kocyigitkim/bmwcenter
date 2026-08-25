import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { entryFor, summaryFor } from "@/core/obd/dtcCatalog";
import { guidanceText } from "@/core/obd/dtcGuidance";

export default function DTCDetailScreen() {
  const { code, status } = useLocalSearchParams<{ code: string; status?: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const languageCode = useAppSettings((s) => s.languageCode);

  const entry = entryFor(code ?? "");
  const summary = summaryFor(code ?? "", languageCode) ?? t("dtc.manufacturerSpecific");
  const severity = entry?.severity ?? "medium";
  const severityColor = severity === "high" ? colors.semCritical : severity === "low" ? colors.semNominal : colors.semAttention;

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge }}>
        <Text style={[styles.code, { color: colors.contentPrimary }]}>{code}</Text>
        <View style={styles.badgeRow}>
          {status ? <Badge text={status} color={colors.contentSecondary} /> : null}
          <Badge text={severity} color={severityColor} />
          {entry?.systemKey ? <Badge text={t(entry.systemKey, { defaultValue: entry.system })} color={colors.contentSecondary} /> : null}
        </View>

        <Text style={[styles.summary, { color: colors.contentSecondary }]}>{summary}</Text>

        <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary, fontWeight: "700", marginBottom: 6 }}>{t("dtc.guidance.title")}</Text>
          <Text style={{ color: colors.contentSecondary }}>{guidanceText(entry?.system, entry?.severity)}</Text>
        </View>

        {status ? (
          <Pressable onPress={() => router.push(`/freeze-frame/${code}`)} style={[styles.card, styles.linkRow, { backgroundColor: colors.surface1 }]}>
            <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t("freezeFrame.title")}</Text>
            <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
          </Pressable>
        ) : null}
      </View>
    </ScrollView>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(color, 0.15) }]}>
      <Text style={{ color, fontSize: 12, fontWeight: "600" }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s2 },
  code: { fontSize: 28, fontWeight: "700" },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: DSSpace.s4 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  summary: { fontSize: 15, marginBottom: DSSpace.cardGap },
  card: { padding: DSSpace.cardPadding, borderRadius: DSRadius.card, marginBottom: DSSpace.cardGap },
  linkRow: { flexDirection: "row", alignItems: "center" },
});
