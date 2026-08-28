import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Canvas, Path, Circle, Skia } from "@shopify/react-native-skia";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { projectRoute, type RoutePoint } from "@/core/trip/routeProjection";

const PADDING = 18;

/** Route shape without map tiles. Used where a real map is unavailable — on
 * Android that is any build without a Google Maps API key, where mounting a
 * MapView throws rather than degrading. */
export function RouteSketch({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const drawing = useMemo(() => {
    const projected = projectRoute(route, width, height, PADDING);
    if (!projected) return undefined;
    const path = Skia.Path.Make();
    path.moveTo(projected.points[0]!.x, projected.points[0]!.y);
    for (const p of projected.points.slice(1)) path.lineTo(p.x, p.y);
    return { path, start: projected.start, end: projected.end };
  }, [route, width, height]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.container, { height, backgroundColor: colors.surface1 }]}
    >
      {drawing ? (
        <Canvas style={{ flex: 1 }}>
          <Path
            path={drawing.path}
            style="stroke"
            strokeWidth={4}
            strokeCap="round"
            strokeJoin="round"
            color={brandPrimary}
          />
          <Circle cx={drawing.start.x} cy={drawing.start.y} r={6} color={colors.semNominal} />
          <Circle cx={drawing.end.x} cy={drawing.end.y} r={6} color={colors.semCritical} />
        </Canvas>
      ) : (
        <View style={styles.empty}>
          <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>{t("trip.route.unavailable")}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.cardGap,
    borderRadius: DSRadius.card,
    overflow: "hidden",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
});
