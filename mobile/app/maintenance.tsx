import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useFocusEffect, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { maintenanceRepository, type MaintenanceItem } from "@/core/storage/maintenanceRepository";

export default function MaintenanceScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<MaintenanceItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      maintenanceRepository.ensureDefaults().then(() => maintenanceRepository.items().then(setItems));
    }, [])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("insights.maintenance")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap, paddingBottom: DSSpace.s8 }}>
        {items.map((item) => (
          <View key={item.id} style={[styles.row, { backgroundColor: colors.surface1 }]}>
            <MaterialCommunityIcons name="wrench" size={20} color={brandPrimary} />
            <View style={{ marginLeft: DSSpace.s3, flex: 1 }}>
              <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>
                {item.customTitle ?? t(item.titleKey, { defaultValue: item.titleKey })}
              </Text>
              <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>
                {item.lastDoneDate ? new Date(item.lastDoneDate).toLocaleDateString() : "—"}
                {item.intervalKm ? ` · every ${item.intervalKm.toLocaleString()} km` : ""}
              </Text>
            </View>
            <Pressable
              onPress={() => maintenanceRepository.markDone(item.id, 0).then(() => maintenanceRepository.items().then(setItems))}
            >
              <MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.semNominal} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
