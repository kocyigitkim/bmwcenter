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
import type { Trip } from "@/core/storage/models";

export default function TripsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const settings = useAppSettings();
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);

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
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/trip/${item.id}`)}
            style={[styles.row, { backgroundColor: colors.surface1 }]}
          >
            <MaterialCommunityIcons name="map-marker-path" size={22} color={brandPrimary} />
            <View style={{ flex: 1, marginLeft: DSSpace.s3 }}>
              <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>
                {new Date(item.startedAt).toLocaleString()}
              </Text>
              <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>
                {Formatters.distance(item.distanceKm, settings)} · {Formatters.consumption(item.avgL100 || undefined, settings)}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={20} color={colors.contentTertiary} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: "700", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
