import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design/theme";
import { DSSpace, brandPrimary, brandSecondary } from "@/design/tokens";
import { unavailable } from "@/design/formatters";
import type { ScoreBreakdown } from "@/core/analysis/drivingScorer";

const DIAMETER = 148;
const LINE_WIDTH = 14;
const SWEEP_DEG = 300;
const START_DEG = 120;

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const path = Skia.Path.Make();
  path.addArc(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), startDeg, endDeg - startDeg);
  return path;
}

function badgeKey(score: number): string {
  if (score >= 90) return "score.badge.smooth";
  if (score >= 75) return "score.badge.steady";
  if (score >= 60) return "score.badge.mixed";
  return "score.badge.aggressive";
}

export function ScoreRing({ score, breakdown }: { score?: number; breakdown?: ScoreBreakdown }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cx = DIAMETER / 2;
  const cy = DIAMETER / 2;
  const r = DIAMETER / 2 - LINE_WIDTH / 2;

  const progress = score != null ? Math.min(Math.max(score / 100, 0), 1) : 0;
  const trackPath = useMemo(() => arcPath(cx, cy, r, START_DEG, START_DEG + SWEEP_DEG), [cx, cy, r]);
  const valuePath = useMemo(
    () => (progress > 0 ? arcPath(cx, cy, r, START_DEG, START_DEG + SWEEP_DEG * progress) : null),
    [cx, cy, r, progress]
  );

  return (
    <View style={styles.container}>
      <View style={{ width: DIAMETER, height: DIAMETER }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={trackPath} style="stroke" strokeWidth={LINE_WIDTH} strokeCap="round" color={colors.hairline} />
          {valuePath && <Path path={valuePath} style="stroke" strokeWidth={LINE_WIDTH} strokeCap="round" color={brandPrimary} />}
        </Canvas>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text style={[styles.scoreText, { color: colors.contentPrimary }]}>{score != null ? Math.round(score) : unavailable()}</Text>
          <View style={[styles.badge, { backgroundColor: colors.surface2 }]}>
            <Text style={{ color: colors.contentSecondary, fontSize: 11 }}>{score != null ? t(badgeKey(score)) : unavailable()}</Text>
          </View>
        </View>
      </View>

      {breakdown && (
        <View style={{ width: "100%", gap: 8, marginTop: DSSpace.s3 }}>
          <ComponentBar label={t("score.acceleration")} value={breakdown.acceleration} ceiling={25} color={colors.semNominal} />
          <ComponentBar label={t("score.braking")} value={breakdown.braking} ceiling={25} color={colors.semAttention} />
          <ComponentBar label={t("score.cornering")} value={breakdown.cornering} ceiling={10} color={colors.semInfo} />
          <ComponentBar label={t("score.speed")} value={breakdown.speed} ceiling={15} color={colors.semCold} />
          <ComponentBar label={t("score.idle")} value={breakdown.idle} ceiling={10} color={colors.semAttention} />
          <ComponentBar label={t("score.efficiency")} value={breakdown.efficiency} ceiling={15} color={brandSecondary} />
        </View>
      )}
    </View>
  );
}

function ComponentBar({ label, value, ceiling, color }: { label: string; value: number; ceiling: number; color: string }) {
  const { colors } = useTheme();
  const pct = Math.min(Math.max(value / ceiling, 0), 1);
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barLabel, { color: colors.contentSecondary }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={[styles.barTrack, { backgroundColor: colors.surface2 }]}>
        <View style={[styles.barFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.barValue, { color: colors.contentTertiary }]}>{Math.round(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  scoreText: { fontSize: 40, fontWeight: "700" },
  badge: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barLabel: { width: 88, fontSize: 11 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
  barValue: { width: 24, textAlign: "right", fontSize: 11 },
});
