import React, { useCallback, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { tripRepository } from "@/core/storage/tripRepository";
import { useTripRecorder } from "@/core/trip/tripRecorder";
import type { Trip } from "@/core/storage/models";

export default function TripsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const recorderState = useTripRecorder((s) => s.state);
  const live = useTripRecorder((s) => s.live);

  const activeTripId =
    recorderState.kind === "recording" || recorderState.kind === "paused" ? recorderState.id : undefined;

  useFocusEffect(
    useCallback(() => {
      tripRepository.recentTrips(100).then(setTrips);
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top }}>
      <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("trips.title")}</Text>
      <FlatList
        data={trips}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: DSSpace.screenEdge, paddingTop: 0, gap: DSSpace.cardGap }}
        ListEmptyComponent={<Text style={{ color: colors.contentTertiary, textAlign: "center", marginTop: 40 }}>{t("trips.empty")}</Text>}
        renderItem={({ item }) => {
          // The open trip's persisted aggregates lag behind by up to one persist tick,
          // so render the recorder's live values for it instead.
          const isActive = item.id === activeTripId;
          const distanceKm = isActive ? live.distanceKm : item.distanceKm;
          const avgL100 = isActive ? live.avgL100 : item.avgL100 || undefined;

          return (
            <Pressable
              onPress={() => router.push(`/trip/${item.id}`)}
              style={[styles.row, { backgroundColor: colors.surface1 }]}
            >
              <MaterialCommunityIcons
                name={isActive ? "record-circle" : "map-marker-path"}
                size={22}
                color={isActive ? colors.semNominal : brandPrimary}
              />
              <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
                <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>
                  {new Date(item.startedAt).toLocaleString()}
                </Text>
                <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>
                  {isActive ? `${t("trip.live.inProgress")} · ` : ""}
                  {Formatters.distance(distanceKm, settings)} · {Formatters.consumption(avgL100, settings)}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={20} color={colors.contentTertiary} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
