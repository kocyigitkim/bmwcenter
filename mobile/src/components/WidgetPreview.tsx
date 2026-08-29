import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { resolveDesign, type WidgetDesign } from "@/core/widget/widgetDesign";
import type { WidgetDataSet } from "@/core/widget/widgetMetrics";

/**
 * The widget, drawn inside the app.
 *
 * It renders the same resolved payload the home-screen widget receives rather
 * than a hand-made mock-up, so what the designer shows and what Android draws
 * cannot drift apart: if a slot would be empty on the home screen, it is empty
 * here too.
 *
 * The type sizes mirror the Android layout (34sp hero, 12/13/10sp elsewhere)
 * so proportions match, though the preview is naturally narrower.
 */
export function WidgetPreview({
  design,
  data,
  now = Date.now(),
  height = 132,
}: {
  design: WidgetDesign;
  data: WidgetDataSet;
  now?: number;
  height?: number;
}) {
  const { t } = useTranslation();
  const payload = resolveDesign(design, data, now);
  const { colors } = payload;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, height }]}>
      {payload.accentStripe && <View style={[styles.stripe, { backgroundColor: colors.accent }]} />}

      <View style={styles.body}>
        {payload.header !== "" && (
          <Text numberOfLines={1} style={[styles.header, { color: colors.muted }]}>
            {payload.header}
          </Text>
        )}

        <Text
          numberOfLines={1}
          style={[styles.hero, { color: colors.primary, fontSize: 34 * payload.heroScale }]}
        >
          {payload.hero}
        </Text>

        {payload.secondary !== "" && (
          <Text numberOfLines={1} style={[styles.secondary, { color: colors.muted }]}>
            {payload.secondary}
          </Text>
        )}

        {payload.barPercent >= 0 && (
          <View style={[styles.barTrack, { backgroundColor: colors.track }]}>
            <View
              style={[
                styles.barFill,
                { backgroundColor: colors.accent, width: `${payload.barPercent}%` as `${number}%` },
              ]}
            />
          </View>
        )}

        {payload.stats.length > 0 && (
          <View style={styles.stats}>
            {payload.stats.map((stat, i) => (
              <View key={`${stat.labelKey}-${i}`} style={styles.statCell}>
                <Text numberOfLines={1} style={[styles.statLabel, { color: colors.muted }]}>
                  {t(stat.labelKey)}
                </Text>
                <Text numberOfLines={1} style={[styles.statValue, { color: colors.primary }]}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", borderRadius: 20, padding: 14, overflow: "hidden" },
  stripe: { width: 3, borderRadius: 2, marginRight: 12 },
  body: { flex: 1, minWidth: 0 },
  header: { fontSize: 12 },
  hero: { fontWeight: "800", marginVertical: 1 },
  secondary: { fontSize: 13 },
  barTrack: { height: 6, borderRadius: 3, marginTop: 8, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3 },
  stats: { flexDirection: "row", marginTop: 10, gap: 8 },
  statCell: { flex: 1, minWidth: 0 },
  statLabel: { fontSize: 10 },
  statValue: { fontSize: 13, fontWeight: "700" },
});
