import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Path, Skia, type SkPath } from "@shopify/react-native-skia";
import { useTheme } from "@/design/theme";
import { DSFont } from "@/design/tokens";
import { semanticFor, type GaugeZone } from "@/design/gaugeZone";
import { Formatters, unavailable } from "@/design/formatters";
import type { AppSettingsState } from "@/core/settings/appSettings";

export type GaugeSize = "hero" | "compact";

const SIZE_SPEC: Record<GaugeSize, { diameter: number; trackWidth: number; valueFont: number }> = {
  hero: { diameter: 188, trackWidth: 16, valueFont: 48 },
  compact: { diameter: 112, trackWidth: 10, valueFont: 28 },
};

const START_DEG = 150;
const SWEEP_DEG = 240;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function arcPath(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): SkPath {
  const path = Skia.Path.Make();
  const rect = Skia.XYWHRect(cx - radius, cy - radius, radius * 2, radius * 2);
  path.addArc(rect, startDeg, endDeg - startDeg);
  return path;
}

interface Props {
  value: number | undefined;
  range: [number, number];
  zones: GaugeZone[];
  unit: string;
  caption: string;
  size?: GaugeSize;
  diameter?: number;
  precision?: number;
  unavailableReason?: string;
  stale?: boolean;
}

export function GaugeRing({
  value,
  range,
  zones,
  unit,
  caption,
  size = "hero",
  diameter,
  precision = 0,
  unavailableReason,
  stale = false,
}: Props) {
  const { colors } = useTheme();
  const spec = SIZE_SPEC[size];
  const resolvedDiameter = diameter ?? spec.diameter;
  const scale = resolvedDiameter / spec.diameter;
  const trackWidth = spec.trackWidth * scale;

  const [lo, hi] = range;
  const span = hi - lo;
  const normalized = value == null || span <= 0 ? 0 : Math.min(Math.max((value - lo) / span, 0), 1);
  const isUnavailable = value == null;
  const semantic = isUnavailable ? "inactive" : semanticFor(value, zones);
  const semanticColor = colors[
    ({ nominal: "semNominal", attention: "semAttention", critical: "semCritical", cold: "semCold", inactive: "semInactive", info: "semInfo" } as const)[semantic]
  ];

  const cx = resolvedDiameter / 2;
  const cy = resolvedDiameter / 2;
  const radius = resolvedDiameter / 2 - trackWidth / 2 - 4 * scale;

  const trackPath = useMemo(
    () => arcPath(cx, cy, radius, START_DEG, START_DEG + SWEEP_DEG),
    [cx, cy, radius]
  );
  const valuePath = useMemo(() => {
    if (isUnavailable || normalized <= 0) return null;
    return arcPath(cx, cy, radius, START_DEG, START_DEG + SWEEP_DEG * normalized);
  }, [cx, cy, radius, normalized, isUnavailable]);

  const ticks = useMemo(() => {
    const majorStep = span / 6;
    const minorStep = span / 24;
    const items: Array<{ x1: number; y1: number; x2: number; y2: number; major: boolean }> = [];
    if (majorStep <= 0 || minorStep <= 0) return items;
    const outerR = radius - trackWidth / 2 - 2 * scale;
    let v = lo;
    let i = 0;
    while (v <= hi + 0.0001) {
      const p = span > 0 ? (v - lo) / span : 0;
      const major = i % 4 === 0;
      const length = (major ? 9 : 4) * scale;
      const angle = toRad(START_DEG + SWEEP_DEG * p);
      items.push({
        x1: cx + Math.cos(angle) * (outerR - length),
        y1: cy + Math.sin(angle) * (outerR - length),
        x2: cx + Math.cos(angle) * outerR,
        y2: cy + Math.sin(angle) * outerR,
        major,
      });
      v += minorStep;
      i += 1;
    }
    return items;
  }, [lo, hi, span, radius, trackWidth, scale, cx, cy]);

  const displayValue = isUnavailable ? unavailable() : Formatters.number(value, precision);
  const bottomCaption = isUnavailable ? unavailableReason ?? unavailable() : caption;

  return (
    <View style={{ width: resolvedDiameter, height: resolvedDiameter, opacity: stale ? 0.45 : 1 }}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Path path={trackPath} style="stroke" strokeWidth={trackWidth} strokeCap="round" color={colors.hairline} opacity={isUnavailable ? 0.4 : 1} />
        {ticks.map((tick, i) => {
          const path = Skia.Path.Make();
          path.moveTo(tick.x1, tick.y1);
          path.lineTo(tick.x2, tick.y2);
          return (
            <Path
              key={i}
              path={path}
              style="stroke"
              strokeWidth={(tick.major ? 1.5 : 1) * scale}
              color={colors.contentTertiary}
              opacity={tick.major ? 1 : 0.35}
            />
          );
        })}
        {valuePath && (
          <Path path={valuePath} style="stroke" strokeWidth={trackWidth} strokeCap="round" color={semanticColor} />
        )}
      </Canvas>
      <View style={[StyleSheet.absoluteFill, styles.center, { paddingTop: trackWidth }]}>
        <Text
          style={[
            styles.value,
            { fontSize: spec.valueFont * scale, color: isUnavailable ? colors.contentTertiary : colors.contentPrimary },
          ]}
          numberOfLines={1}
        >
          {displayValue}
        </Text>
        <Text style={[styles.unit, { fontSize: DSFont.unit * Math.max(scale, 0.85), color: colors.contentSecondary }]}>
          {unit}
        </Text>
        <Text
          style={[styles.caption, { fontSize: DSFont.label * Math.max(scale, 0.85), color: colors.contentSecondary }]}
          numberOfLines={1}
        >
          {bottomCaption}
        </Text>
      </View>
    </View>
  );
}

export function displaySpeed(kmh: number | undefined, settings: Pick<AppSettingsState, "unitSystem">): number | undefined {
  if (kmh == null) return undefined;
  return settings.unitSystem === "metric" ? kmh : kmh * 0.621371;
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  value: { fontWeight: "700" },
  unit: { fontWeight: "500", marginTop: 2 },
  caption: { fontWeight: "500", marginTop: 2 },
});
