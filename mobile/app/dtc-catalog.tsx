import React, { useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet, Pressable, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { allEntries, bmwEntries } from "@/core/obd/dtcCatalog";

export default function DTCCatalogScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const languageCode = useAppSettings((s) => s.languageCode);
  const [query, setQuery] = useState("");

  const all = useMemo(() => allEntries(languageCode), [languageCode]);
  const bmw = useMemo(() => bmwEntries(languageCode), [languageCode]);
  const q = query.trim().toUpperCase();
  const filtered = useMemo(() => {
    if (!q) return [];
    return all.filter((e) => e.code.includes(q) || e.summary.toUpperCase().includes(q)).slice(0, 200);
  }, [all, q]);

  const listData = q ? filtered : bmw;

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("dtc.catalog.title")}</Text>
      </View>

      <View style={[styles.searchBox, { backgroundColor: colors.surface1 }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.contentTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t("dtc.catalog.search")}
          placeholderTextColor={colors.contentTertiary}
          autoCapitalize="characters"
          style={{ color: colors.contentPrimary, flex: 1, marginLeft: 8 }}
        />
      </View>

      <Text style={[styles.subtitle, { color: colors.contentSecondary }]}>
        {q ? t("dtc.catalog.results") : t("dtc.catalog.bmwSection")}
      </Text>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.code}
        contentContainerStyle={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.s2, paddingBottom: DSSpace.s8 }}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/dtc/${item.code}`)} style={[styles.row, { backgroundColor: colors.surface1 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ color: colors.contentPrimary, fontWeight: "700" }}>{item.code}</Text>
              {item.bmw && (
                <View style={[styles.badge, { backgroundColor: withAlpha(brandPrimary, 0.2) }]}>
                  <Text style={{ color: brandPrimary, fontSize: 10, fontWeight: "700" }}>BMW</Text>
                </View>
              )}
            </View>
            <Text style={{ color: colors.contentSecondary, fontSize: 13, marginTop: 2 }} numberOfLines={2}>
              {item.summary}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s3 },
  title: { fontSize: 22, fontWeight: "700" },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: DSSpace.screenEdge,
    padding: 10,
    borderRadius: 12,
    marginBottom: DSSpace.s3,
  },
  subtitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s2 },
  row: { padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  badge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999 },
});
