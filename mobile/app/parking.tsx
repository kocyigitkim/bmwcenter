import React from "react";
import { View, Text, StyleSheet, Pressable, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";

export default function ParkingScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const hasLocation = settings.lastParkingLatitude != null && settings.lastParkingLongitude != null;

  const saveLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({});
    settings.set("lastParkingLatitude", pos.coords.latitude);
    settings.set("lastParkingLongitude", pos.coords.longitude);
    const places = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
    settings.set("lastParkingPlaceName", places[0]?.street ?? places[0]?.name ?? null);
  };

  const openDirections = () => {
    if (!hasLocation) return;
    const url = `https://maps.google.com/?daddr=${settings.lastParkingLatitude},${settings.lastParkingLongitude}&dirflg=w`;
    Linking.openURL(url);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("parking.title")}</Text>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="map-marker" size={32} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginTop: DSSpace.s2, fontWeight: "600" }}>
            {hasLocation ? settings.lastParkingPlaceName ?? t("parking.title") : t("dashboard.parkingEmpty")}
          </Text>
        </View>

        <Pressable onPress={saveLocation} style={[styles.actionButton, { backgroundColor: brandPrimary }]}>
          <Text style={styles.actionText}>{t("parking.save")}</Text>
        </Pressable>

        {hasLocation && (
          <Pressable onPress={openDirections} style={[styles.actionButton, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.actionText, { color: colors.contentPrimary }]}>{t("parking.directions")}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  card: { alignItems: "center", padding: DSSpace.cardPadding * 1.5, borderRadius: DSRadius.card },
  actionButton: { padding: 14, borderRadius: DSRadius.card, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "700" },
});
