import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, type LayoutChangeEvent, type GestureResponderEvent } from "react-native";
import { Canvas, Path, Skia, LinearGradient, vec, type SkPath } from "@shopify/react-native-skia";
import { useTheme } from "@/design/theme";
import { withAlpha } from "@/design/tokens";
import { axisBounds, downsample, type MetricSample } from "@/core/metrics/metricHistory";

/** More points than this in a phone-width chart is detail nobody can see. */
const MAX_POINTS = 240;

interface Props {
  samples: MetricSample[];
  color: string;
  height?: number;
  /** Renders the value beside the scrub line. */
  formatValue: (value: number) => string;
  emptyText: string;
}

interface Geometry {
  line: SkPath;
  fill: SkPath;
  points: Array<{ x: number; y: number; sample: MetricSample }>;
  low: number;
  high: number;
}

export function MetricChart({ samples, color, height = 200, formatValue, emptyText }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [scrubX, setScrubX] = useState<number | undefined>();

  const geometry = useMemo<Geometry | undefined>(() => {
    if (width <= 0 || samples.length < 2) return undefined;
    return buildGeometry(downsample(samples, MAX_POINTS), width, height);
  }, [samples, width, height]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const scrubbed = useMemo(() => {
    if (!geometry || scrubX == null) return undefined;
    return nearestPoint(geometry.points, scrubX);
  }, [geometry, scrubX]);

  const track = (event: GestureResponderEvent) => setScrubX(event.nativeEvent.locationX);

  return (
    <View
      onLayout={onLayout}
      style={{ height, borderRadius: 14, overflow: "hidden", backgroundColor: colors.surface2 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={track}
      onResponderMove={track}
      onResponderRelease={() => setScrubX(undefined)}
      onResponderTerminate={() => setScrubX(undefined)}
    >
      {!geometry ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.contentTertiary, fontSize: 13 }}>{emptyText}</Text>
        </View>
      ) : (
        <>
          <Canvas style={{ width, height }}>
            <Path path={geometry.fill}>
              <LinearGradient
                start={vec(0, 0)}
                end={vec(0, height)}
                colors={[withAlpha(color, 0.32), withAlpha(color, 0.0)]}
              />
            </Path>
            <Path path={geometry.line} style="stroke" strokeWidth={2} color={color} strokeJoin="round" strokeCap="round" />
          </Canvas>

          {scrubbed && (
            <>
              <View
                pointerEvents="none"
                style={[styles.scrubLine, { left: scrubbed.x, backgroundColor: withAlpha(color, 0.55) }]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.scrubDot,
                  { left: scrubbed.x - 4, top: scrubbed.y - 4, backgroundColor: color, borderColor: colors.surface1 },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.scrubLabel,
                  {
                    backgroundColor: colors.surface1,
                    // Keep the readout inside the chart at either edge.
                    left: Math.min(Math.max(scrubbed.x - 40, 4), Math.max(width - 84, 4)),
                  },
                ]}
              >
                <Text style={{ color: colors.contentPrimary, fontSize: 12, fontWeight: "700" }}>
                  {formatValue(scrubbed.sample.value)}
                </Text>
              </View>
            </>
          )}
        </>
      )}
    </View>
  );
}

function buildGeometry(samples: MetricSample[], width: number, height: number): Geometry | undefined {
  if (samples.length < 2) return undefined;

  const values = samples.map((s) => s.value);
  const [low, high] = axisBounds(Math.min(...values), Math.max(...values));
  const span = high - low;
  const firstT = samples[0]!.t;
  const lastT = samples[samples.length - 1]!.t;
  // Samples can share a timestamp after downsampling a very short series.
  const duration = lastT - firstT || 1;
  const padY = 8;
  const usableHeight = height - padY * 2;

  const points = samples.map((sample) => ({
    x: ((sample.t - firstT) / duration) * width,
    y: padY + (1 - (sample.value - low) / span) * usableHeight,
    sample,
  }));

  const line = Skia.Path.Make();
  line.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i += 1) line.lineTo(points[i]!.x, points[i]!.y);

  const fill = line.copy();
  fill.lineTo(points[points.length - 1]!.x, height);
  fill.lineTo(points[0]!.x, height);
  fill.close();

  return { line, fill, points, low, high };
}

function nearestPoint(points: Geometry["points"], x: number) {
  let best = points[0]!;
  let bestDistance = Infinity;
  for (const point of points) {
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  scrubLine: { position: "absolute", top: 0, bottom: 0, width: 1 },
  scrubDot: { position: "absolute", width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  scrubLabel: {
    position: "absolute",
    top: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
});
