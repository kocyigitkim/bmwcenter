import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, brandPrimary } from "@/design/tokens";
import { useOBDStore } from "@/core/obd/obdService";
import { useAppSettings } from "@/core/settings/appSettings";
import { useDashboardLayout } from "@/core/dashboard/dashboardLayoutStore";
import { packedRows, hideWidget, ALL_PRESETS, type DashboardWidgetItem } from "@/core/dashboard/dashboardLayout";
import { DashboardWidgetView } from "@/components/DashboardWidgetView";
import { DashboardWidgetGallery } from "@/components/DashboardWidgetGallery";
import { AlertChipRow } from "@/components/AlertChipRow";

export default function DashboardScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useDashboardLayout((s) => s.layout);
  const setLayout = useDashboardLayout((s) => s.setLayout);
  const applyPreset = useDashboardLayout((s) => s.applyPreset);
  const connection = useOBDStore((s) => s.connection);
  const useMockAdapter = useAppSettings((s) => s.useMockAdapter);
  const useMockTransport = useOBDStore((s) => s.useMockTransport);
  const autoConnectOnLaunch = useAppSettings((s) => s.autoConnectOnLaunch);
  const scan = useOBDStore((s) => s.scan);
  const devices = useOBDStore((s) => s.devices);
  const connect = useOBDStore((s) => s.connect);
  const disconnect = useOBDStore((s) => s.disconnect);
  const [isEditing, setIsEditing] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    useMockTransport(useMockAdapter);
  }, [useMockAdapter, useMockTransport]);

  useEffect(() => {
    if (!autoConnectOnLaunch) return;
    if (connection.status !== "idle") return;
    scan().then(() => {
      const first = useOBDStore.getState().devices[0];
      if (first) connect(first.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnectOnLaunch]);

  const rows = packedRows(layout);
  const connected = connection.status === "connected";

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("tab.dashboard")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: DSSpace.s2 }}>
          <ConnectionPill connected={connected} scanning={connection.status === "scanning"} onPress={() => (connected ? disconnect() : scan())} />
          <Pressable onPress={() => setIsEditing((v) => !v)} hitSlop={8}>
            <Text style={{ color: brandPrimary, fontWeight: "600" }}>
              {isEditing ? t("dashboard.doneEditing") : t("dashboard.editLayout")}
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetRow}>
        {ALL_PRESETS.map((preset) => (
          <Pressable
            key={preset}
            onPress={() => applyPreset(preset)}
            style={[styles.presetChip, { backgroundColor: preset === layout.preset ? brandPrimary : colors.surface2 }]}
          >
            <Text style={{ color: preset === layout.preset ? "#fff" : colors.contentPrimary, fontSize: 12, fontWeight: "600" }}>
              {t(`dashboard.preset.${preset}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <AlertChipRow />

      {!connected && devices.length > 0 && (
        <View style={[styles.deviceList, { backgroundColor: colors.surface1 }]}>
          <Text style={{ color: colors.contentSecondary, marginBottom: DSSpace.s2 }}>{t("connection.chooseAdapter")}</Text>
          {devices.map((d) => (
            <Pressable key={d.id} onPress={() => connect(d.id)} style={styles.deviceRow}>
              <MaterialCommunityIcons name="bluetooth" size={18} color={brandPrimary} />
              <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s2 }}>{d.name ?? d.id}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        {rows.map((row) => (
          <Row
            key={rowKeyFor(row)}
            row={row}
            isEditing={isEditing}
            onRemove={(kind) => setLayout(hideWidget(layout, kind))}
          />
        ))}
        {isEditing && (
          <Pressable onPress={() => setGalleryOpen(true)} style={[styles.addRow, { borderColor: colors.hairline }]}>
            <MaterialCommunityIcons name="plus" size={18} color={brandPrimary} />
            <Text style={{ color: brandPrimary, fontWeight: "600", marginLeft: 6 }}>{t("dashboard.gallery")}</Text>
          </Pressable>
        )}
      </View>

      <DashboardWidgetGallery
        visible={galleryOpen}
        layout={layout}
        onAdd={(kind) => setLayout({ ...layout, items: [...layout.items, { id: kind, size: "small" }], isCustomized: true })}
        onClose={() => setGalleryOpen(false)}
      />
    </ScrollView>
  );
}

function rowKeyFor(row: ReturnType<typeof packedRows>[number]): string {
  if (row.kind === "dualHero") return `dual-${row.a.id}-${row.b.id}`;
  if (row.kind === "hero") return `hero-${row.item.id}`;
  return `pair-${row.a.id}-${row.b?.id ?? "none"}`;
}

function Row({
  row,
  isEditing,
  onRemove,
}: {
  row: ReturnType<typeof packedRows>[number];
  isEditing: boolean;
  onRemove: (kind: DashboardWidgetItem["id"]) => void;
}) {
  if (row.kind === "dualHero") {
    return (
      <View style={styles.rowDual}>
        <EditableCell isEditing={isEditing} onRemove={() => onRemove(row.a.id)}>
          <DashboardWidgetView item={row.a} placement="heroDual" isEditing={isEditing} />
        </EditableCell>
        <EditableCell isEditing={isEditing} onRemove={() => onRemove(row.b.id)}>
          <DashboardWidgetView item={row.b} placement="heroDual" isEditing={isEditing} />
        </EditableCell>
      </View>
    );
  }
  if (row.kind === "hero") {
    return (
      <EditableCell isEditing={isEditing} onRemove={() => onRemove(row.item.id)}>
        <DashboardWidgetView item={row.item} placement="heroFull" isEditing={isEditing} />
      </EditableCell>
    );
  }
  return (
    <View style={styles.rowPair}>
      <EditableCell isEditing={isEditing} onRemove={() => onRemove(row.a.id)}>
        <DashboardWidgetView item={row.a} placement="gridCell" isEditing={isEditing} />
      </EditableCell>
      {row.b ? (
        <EditableCell isEditing={isEditing} onRemove={() => onRemove((row.b as DashboardWidgetItem).id)}>
          <DashboardWidgetView item={row.b as DashboardWidgetItem} placement="gridCell" isEditing={isEditing} />
        </EditableCell>
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}

function EditableCell({
  isEditing,
  onRemove,
  children,
}: {
  isEditing: boolean;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={{ flex: 1 }}>
      {children}
      {isEditing && (
        <Pressable onPress={onRemove} style={styles.removeBadge} hitSlop={8}>
          <MaterialCommunityIcons name="minus-circle" size={24} color="#D22C2E" />
        </Pressable>
      )}
    </View>
  );
}

function ConnectionPill({
  connected,
  scanning,
  onPress,
}: {
  connected: boolean;
  scanning: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const label = scanning ? t("connection.scanning") : connected ? t("connection.connected") : t("connection.disconnected");
  const color = connected ? colors.semNominal : scanning ? colors.semAttention : colors.contentTertiary;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, { borderColor: color, backgroundColor: colors.surface1 }]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={{ color: colors.contentPrimary, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: DSSpace.screenEdge,
    marginBottom: DSSpace.s3,
  },
  title: { fontSize: 28, fontWeight: "700" },
  presetRow: { gap: 6, paddingHorizontal: DSSpace.screenEdge, paddingBottom: DSSpace.s3 },
  presetChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  deviceList: { marginHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4, padding: DSSpace.cardPadding, borderRadius: 20 },
  deviceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  rowDual: { flexDirection: "row", gap: DSSpace.cardGap },
  rowPair: { flexDirection: "row", gap: DSSpace.cardGap },
  removeBadge: { position: "absolute", top: -6, right: -6, backgroundColor: "#fff", borderRadius: 12 },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: DSSpace.cardPadding,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
});
