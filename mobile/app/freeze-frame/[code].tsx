import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { eq } from "drizzle-orm";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { db } from "@/core/storage/db";
import { dtcRecords } from "@/core/storage/schema";
import { emptySnapshot, type VehicleSnapshot } from "@/core/obd/vehicleSnapshot";

export default function FreezeFrameScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const [snap, setSnap] = useState<VehicleSnapshot>(emptySnapshot());
  const [found, setFound] = useState(true);

  useEffect(() => {
    if (!code) return;
    db.select()
      .from(dtcRecords)
      .where(eq(dtcRecords.code, code))
      .then((rows) => {
        const withFrame = rows.find((r) => r.freezeFrameJSON);
        if (withFrame?.freezeFrameJSON) {
          try {
            setSnap(JSON.parse(withFrame.freezeFrameJSON));
          } catch {
            setFound(false);
          }
        } else {
          setFound(false);
        }
      });
  }, [code]);

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("freezeFrame.title")}</Text>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        <Text style={{ color: colors.contentPrimary, fontSize: 22, fontWeight: "700" }}>{code}</Text>
        {!found ? (
          <Text style={{ color: colors.contentTertiary }}>{t("freezeFrame.empty")}</Text>
        ) : (
          <>
            <Stat label={t("metric.speed")} value={Formatters.speed(snap.speedKmh, settings)} />
            <Stat label={t("metric.rpm")} value={Formatters.rpm(snap.rpm)} />
            <Stat label={t("metric.coolant")} value={Formatters.temperature(snap.coolantC, settings)} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.contentPrimary, fontSize: 20, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  card: { padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
