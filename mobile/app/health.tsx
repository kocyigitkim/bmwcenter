import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { loadHealthReport } from "@/core/health/healthRepository";
import type { CategoryHealth, HealthGrade, HealthReport } from "@/core/health/healthScore";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const CATEGORY_ICON: Record<string, IconName> = {
  engine: "engine",
  cooling: "thermometer",
  fuelSystem: "gas-station",
  emissions: "leaf",
  battery: "car-battery",
  transmission: "cog",
};

export default function HealthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [report, setReport] = useState<HealthReport | undefined>();
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      loadHealthReport()
        .then((r) => !cancelled && setReport(r))
        .catch(() => undefined)
        .finally(() => !cancelled && setLoading(false));
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const gradeColor = (grade: HealthGrade) => {
    switch (grade) {
      case "good":
        return colors.semNominal;
      case "watch":
        return colors.semAttention;
      case "attention":
        return colors.semCritical;
      case "unknown":
        return colors.contentTertiary;
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
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("health.title")}</Text>
      </View>

      {loading && !report ? (
        <ActivityIndicator style={{ marginTop: DSSpace.s8 }} />
      ) : !report ? null : (
        <>
          <View style={[styles.hero, { backgroundColor: colors.surface1 }]}>
            <Text style={[styles.heroScore, { color: gradeColor(report.overallGrade) }]}>
              {report.overallScore ?? "--"}
            </Text>
            <Text style={{ color: colors.contentSecondary, fontSize: 13 }}>
              {t(`health.grade.${report.overallGrade}`)}
            </Text>
            {report.unknownCount > 0 && (
              <Text style={{ color: colors.contentTertiary, fontSize: 12, marginTop: DSSpace.s2, textAlign: "center" }}>
                {t("health.unknownHint", { count: report.unknownCount })}
              </Text>
            )}
          </View>

          {report.categories.map((c) => (
            <CategoryCard key={c.category} category={c} color={gradeColor(c.grade)} />
          ))}

          <Text style={[styles.footnote, { color: colors.contentTertiary }]}>{t("health.footnote")}</Text>
        </>
      )}
    </ScrollView>
  );
}

function CategoryCard({ category, color }: { category: CategoryHealth; color: string }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.icon, { backgroundColor: withAlpha(color, 0.14) }]}>
          <MaterialCommunityIcons name={CATEGORY_ICON[category.category] ?? "engine"} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.contentPrimary, fontSize: 16, fontWeight: "700" }}>
            {t(`health.category.${category.category}`)}
          </Text>
          <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>
            {t(`health.confidence.${category.confidence}`)}
          </Text>
        </View>
        <Text style={{ color, fontSize: 18, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
          {category.score ?? "--"}
        </Text>
      </View>

      {category.score != null && (
        <View style={[styles.bar, { backgroundColor: colors.surface2 }]}>
          <View style={[styles.barFill, { width: `${category.score}%` as `${number}%`, backgroundColor: color }]} />
        </View>
      )}

      {category.evidence.length > 0 ? (
        category.evidence.map((e, i) => (
          <View key={`${e.key}-${i}`} style={styles.evidenceRow}>
            <MaterialCommunityIcons name="circle-small" size={18} color={colors.contentTertiary} />
            <Text style={{ color: colors.contentSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
              {t(e.key, e.params)}
            </Text>
          </View>
        ))
      ) : (
        <Text style={{ color: colors.contentTertiary, fontSize: 12, marginTop: DSSpace.s2 }}>
          {t(category.grade === "unknown" ? "health.noBasis" : "health.noFindings")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  hero: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    paddingVertical: DSSpace.s6,
    paddingHorizontal: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
    alignItems: "center",
  },
  heroScore: { fontSize: 52, fontWeight: "800", fontVariant: ["tabular-nums"] },
  card: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    padding: DSSpace.cardPadding,
    borderRadius: DSRadius.card,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: DSSpace.s3 },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  bar: { height: 6, borderRadius: 3, overflow: "hidden", marginTop: DSSpace.s3 },
  barFill: { height: 6, borderRadius: 3 },
  evidenceRow: { flexDirection: "row", alignItems: "flex-start", marginTop: DSSpace.s2 },
  footnote: { fontSize: 11, lineHeight: 16, paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginTop: DSSpace.s2 },
});
