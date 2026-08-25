import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import type { TripSummaryCardModel } from "@/core/care/tripSummaryCard";

export function TripSummaryCardView({ model }: { model: TripSummaryCardModel }) {
  const { colors } = useTheme();
  const settings = useAppSettings();

  return (
    <View style={[styles.card, { backgroundColor: colors.canvasElevated }]}>
      <Text style={[styles.vehicle, { color: colors.contentSecondary }]}>{model.vehicleName || "QuickCar"}</Text>
      <Text style={[styles.date, { color: colors.contentTertiary }]}>{new Date(model.date).toLocaleDateString()}</Text>

      <View style={styles.grid}>
        <Stat icon="map-marker-distance" label="Distance" value={Formatters.distance(model.distanceKm, settings)} />
        <Stat icon="fuel" label="Consumption" value={Formatters.consumption(model.avgL100 || undefined, settings)} />
        <Stat icon="cash" label="Cost" value={Formatters.currency(model.cost, model.currencyCode)} />
        <Stat icon="star" label="Score" value={model.score != null ? Formatters.number(model.score, 0) : "--"} />
      </View>

      <View style={styles.badgeRow}>
        {model.cleanWarmup && <Badge icon="snowflake-check" text="Clean warmup" />}
        {model.harshBrakes === 0 && <Badge icon="check-decagram" text="No harsh braking" />}
      </View>

      <View style={styles.footer}>
        <MaterialCommunityIcons name="car" size={14} color={brandPrimary} />
        <Text style={{ color: colors.contentTertiary, fontSize: 11, marginLeft: 4 }}>QuickCar</Text>
      </View>
    </View>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stat}>
      <MaterialCommunityIcons name={icon} size={16} color={brandPrimary} />
      <Text style={{ color: colors.contentPrimary, fontSize: 18, fontWeight: "700", marginTop: 4 }}>{value}</Text>
      <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function Badge({ icon, text }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; text: string }) {
  return (
    <View style={styles.badge}>
      <MaterialCommunityIcons name={icon} size={12} color={brandPrimary} />
      <Text style={{ color: brandPrimary, fontSize: 11, fontWeight: "600", marginLeft: 4 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: 320, padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  vehicle: { fontSize: 13, fontWeight: "600" },
  date: { fontSize: 11, marginBottom: DSSpace.s4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: DSSpace.s3 },
  stat: { width: "47%" },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: DSSpace.s4 },
  badge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(28,111,224,0.12)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  footer: { flexDirection: "row", alignItems: "center", marginTop: DSSpace.s4 },
});
