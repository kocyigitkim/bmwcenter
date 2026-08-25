import React from "react";
import { View, Text, Modal, SectionList, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, brandPrimary } from "@/design/tokens";
import {
  ALL_WIDGET_KINDS,
  titleKey,
  icon,
  galleryCategory,
  type DashboardWidgetKind,
  type DashboardWidgetCategory,
} from "@/core/dashboard/dashboardWidgetKind";
import { placedKinds, type DashboardLayout } from "@/core/dashboard/dashboardLayout";

const CATEGORIES: DashboardWidgetCategory[] = ["engine", "fuel", "extended", "electrical", "actions"];
const CATEGORY_TITLE_KEY: Record<DashboardWidgetCategory, string> = {
  engine: "dashboard.gallery.engine",
  fuel: "dashboard.gallery.fuel",
  extended: "dashboard.gallery.extended",
  electrical: "dashboard.gallery.electrical",
  actions: "dashboard.gallery.actions",
};

interface Props {
  visible: boolean;
  layout: DashboardLayout;
  onAdd: (kind: DashboardWidgetKind) => void;
  onClose: () => void;
}

export function DashboardWidgetGallery({ visible, layout, onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const placed = placedKinds(layout);

  const sections = CATEGORIES.map((category) => ({
    title: t(CATEGORY_TITLE_KEY[category]),
    data: ALL_WIDGET_KINDS.filter((k) => galleryCategory[k] === category),
  })).filter((s) => s.data.length > 0);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.canvas }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("dashboard.gallery")}</Text>
          <Pressable onPress={onClose}>
            <Text style={{ color: brandPrimary, fontWeight: "600" }}>{t("action.done")}</Text>
          </Pressable>
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingBottom: DSSpace.s8 }}
          renderSectionHeader={({ section }) => (
            <Text style={[styles.sectionTitle, { color: colors.contentSecondary, backgroundColor: colors.canvas }]}>{section.title}</Text>
          )}
          renderItem={({ item }) => {
            const isPlaced = placed.has(item);
            return (
              <Pressable
                disabled={isPlaced}
                onPress={() => {
                  onAdd(item);
                  onClose();
                }}
                style={[styles.row, { borderBottomColor: colors.hairline }]}
              >
                <MaterialCommunityIcons name={icon[item] as never} size={20} color={brandPrimary} style={{ width: 28 }} />
                <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t(titleKey[item])}</Text>
                {isPlaced ? (
                  <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>{t("dashboard.added")}</Text>
                ) : (
                  <MaterialCommunityIcons name="plus-circle" size={22} color={brandPrimary} />
                )}
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s3 },
  title: { fontSize: 20, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingHorizontal: DSSpace.screenEdge, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.screenEdge, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8 },
});
