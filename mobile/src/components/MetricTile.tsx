import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Path, Skia } from "@shopify/react-native-skia";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, DSFont, brandPrimary } from "@/design/tokens";
import { semanticFor, type GaugeZone } from "@/design/gaugeZone";
import { unavailable } from "@/design/formatters";

export type MetricTileVariant = "value" | "valueBar" | "valueTrend" | "empty";

interface Props {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  valueText?: string;
  unit: string;
  variant?: MetricTileVariant;
  emptyReason?: string;
  progress?: number;
  zones?: GaugeZone[];
  range?: [number, number];
  value?: number;
  trend?: number[];
  stale?: boolean;
}

const MIN_HEIGHT: Record<MetricTileVariant, number> = {
  value: 112,
  valueBar: 132,
  valueTrend: 148,
  empty: 84,
};

export function MetricTile({
  label,
  icon,
  valueText,
  unit,
  variant = "value",
  emptyReason,
  progress,
  zones = [],
  range = [0, 100],
  value,
  trend = [],
  stale = false,
}: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          minHeight: MIN_HEIGHT[variant],
          backgroundColor: colors.surface1,
          opacity: stale ? 0.6 : 1,
        },
      ]}
    >
      <View style={styles.header}>
        <MaterialCommunityIcons name={icon} size={15} color={colors.contentSecondary} />
        <Text style={[styles.label, { color: colors.contentSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>

      {variant === "empty" ? (
        <Text style={[styles.emptyText, { color: colors.contentTertiary }]}>
          {emptyReason ?? unavailable()}
        </Text>
      ) : (
        <>
          <Text style={[styles.value, { color: colors.contentPrimary }]} numberOfLines={1}>
            {valueText ?? unavailable()}
          </Text>
          <Text style={[styles.unit, { color: colors.contentSecondary }]} numberOfLines={1}>
            {unit}
          </Text>
          {variant === "valueBar" && progress != null && (
            <StatusBar progress={progress} zones={zones} value={value} range={range} />
          )}
          {variant === "valueTrend" && <MiniSparkline values={trend} />}
        </>
      )}
    </View>
  );
}

function StatusBar({
  progress,
  zones,
  value,
  range,
}: {
  progress: number;
  zones: GaugeZone[];
  value?: number;
  range: [number, number];
}) {
  const { colors } = useTheme();
  const semantic = value == null ? "nominal" : semanticFor(value, zones);
  const color = colors[
    ({ nominal: "semNominal", attention: "semAttention", critical: "semCritical", cold: "semCold", inactive: "semInactive", info: "semInfo" } as const)[
      semantic
    ]
  ];
  return (
    <View style={[styles.barTrack, { backgroundColor: colors.surface3 }]}>
      <View style={[styles.barFill, { width: `${Math.min(Math.max(progress, 0), 1) * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

function MiniSparkline({ values, height = 24 }: { values: number[]; height?: number }) {
  const path = useMemo(() => {
    if (values.length < 2) return null;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const span = Math.max(maxV - minV, 0.001);
    const p = Skia.Path.Make();
    values.forEach((v, i) => {
      const x = (i / (values.length - 1)) * 200;
      const y = height * (1 - (v - minV) / span);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    });
    return p;
  }, [values, height]);

  return (
    <Canvas style={{ height, marginTop: 4, width: "100%" }}>
      {path && <Path path={path} style="stroke" strokeWidth={1.5} strokeCap="round" strokeJoin="round" color={brandPrimary} />}
    </Canvas>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderRadius: DSRadius.tile,
    padding: DSSpace.cardPadding,
    justifyContent: "flex-start",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: DSSpace.s2 },
  label: { fontSize: DSFont.label, fontWeight: "500", flexShrink: 1 },
  value: { fontSize: DSFont.metricXL, fontWeight: "700" },
  unit: { fontSize: DSFont.unit, fontWeight: "500" },
  emptyText: { fontSize: DSFont.caption },
  barTrack: { height: 6, borderRadius: 3, marginTop: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
});
