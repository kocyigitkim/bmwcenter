import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import MapView, { Polyline, Marker } from "react-native-maps";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { exportTripsCSV } from "@/core/export/csvExporter";
import { exportTripGPX } from "@/core/export/gpxExporter";
import type { Trip } from "@/core/storage/models";

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | undefined>();

  useEffect(() => {
    if (id) tripRepository.trip(id).then(setTrip);
  }, [id]);

  if (!trip) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }

  const route = trip.routeData ?? [];
  const hasRoute = route.length > 1;

  const exportCSV = async () => {
    const uri = await exportTripsCSV([trip]);
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
  };
  const exportGPX = async () => {
    const uri = await exportTripGPX(trip);
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
  };
  const deleteTrip = async () => {
    await tripRepository.deleteTrip(trip.id);
    router.back();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{new Date(trip.startedAt).toLocaleString()}</Text>
      </View>

      {hasRoute && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: route[0]!.lat,
            longitude: route[0]!.lon,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
        >
          <Polyline coordinates={route.map((c) => ({ latitude: c.lat, longitude: c.lon }))} strokeColor={brandPrimary} strokeWidth={4} />
          <Marker coordinate={{ latitude: route[0]!.lat, longitude: route[0]!.lon }} title={t("trip.start", { defaultValue: "Start" })} pinColor="green" />
          <Marker
            coordinate={{ latitude: route[route.length - 1]!.lat, longitude: route[route.length - 1]!.lon }}
            title={t("trip.end", { defaultValue: "End" })}
          />
        </MapView>
      )}

      <View style={[styles.grid, { paddingHorizontal: DSSpace.screenEdge }]}>
        <Stat label={t("trip.distance")} value={Formatters.distance(trip.distanceKm, settings)} />
        <Stat label={t("trip.average")} value={Formatters.consumption(trip.avgL100 || undefined, settings)} />
        <Stat label={t("unit.liter")} value={Formatters.liters(trip.fuelUsedL)} />
        <Stat label={t("metric.speed")} value={Formatters.speed(trip.maxSpeedKmh, settings)} />
        <Stat label="Duration" value={Formatters.duration(trip.durationS)} />
        <Stat label="Score" value={trip.scoreTotal != null ? Formatters.number(trip.scoreTotal, 0) : "--"} />
      </View>

      {trip.note ? (
        <View style={[styles.noteCard, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentPrimary }}>{trip.note}</Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.s3, marginTop: DSSpace.s4 }}>
        <Pressable onPress={exportCSV} style={[styles.actionRow, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="file-delimited-outline" size={18} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s2 }}>{t("trip.exportCSV", { defaultValue: "Export CSV" })}</Text>
        </Pressable>
        {hasRoute && (
          <Pressable onPress={exportGPX} style={[styles.actionRow, { backgroundColor: colors.surface1 }]}>
            <MaterialCommunityIcons name="map-marker-path" size={18} color={brandPrimary} />
            <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s2 }}>{t("trip.exportGPX", { defaultValue: "Export GPX" })}</Text>
          </Pressable>
        )}
        <Pressable onPress={deleteTrip} style={[styles.actionRow, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.semCritical} />
          <Text style={{ color: colors.semCritical, marginLeft: DSSpace.s2 }}>{t("common.delete")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.surface1 }]}>
      <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 20, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: DSSpace.cardGap },
  stat: { width: "47%", padding: DSSpace.cardPadding, borderRadius: DSRadius.tile },
  noteCard: { margin: DSSpace.screenEdge, padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  map: { height: 220, marginHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.cardGap, borderRadius: DSRadius.card, overflow: "hidden" },
  actionRow: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
