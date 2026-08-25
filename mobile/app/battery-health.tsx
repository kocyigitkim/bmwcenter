import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { maintenanceRepository } from "@/core/storage/maintenanceRepository";
import type { crankRecords } from "@/core/storage/schema";

export default function BatteryHealthScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [records, setRecords] = useState<(typeof crankRecords.$inferSelect)[]>([]);

  useEffect(() => {
    maintenanceRepository.crankHistory().then(setRecords);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("battery.title")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap, paddingBottom: DSSpace.s8 }}>
        {records.length === 0 ? (
          <Text style={{ color: colors.contentTertiary, textAlign: "center", marginTop: 40 }}>{t("battery.empty")}</Text>
        ) : (
          records.map((r) => (
            <View key={r.id} style={[styles.row, { backgroundColor: colors.surface1 }]}>
              <MaterialCommunityIcons name="car-battery" size={20} color={brandPrimary} />
              <View style={{ marginLeft: DSSpace.s3, flex: 1 }}>
                <Text style={{ color: colors.contentPrimary }}>{new Date(r.date).toLocaleDateString()}</Text>
                <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>
                  min {Formatters.voltage(r.minVoltage)} · resting {Formatters.voltage(r.restingVoltage)}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
