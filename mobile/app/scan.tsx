import React, { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useOBDStore } from "@/core/obd/obdService";
import { ELM327Commands } from "@/core/obd/elm327Commands";
import { parseDTCResponse } from "@/core/obd/obdFrameParser";
import { db } from "@/core/storage/db";
import { dtcRecords } from "@/core/storage/schema";
import { useAlertEngine } from "@/core/alerts/alertEngine";
import type { DTC } from "@/core/obd/vehicleSnapshot";

export default function ScanScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const transport = useOBDStore((s) => s.transport);
  const connection = useOBDStore((s) => s.connection);
  const snapshot = useOBDStore((s) => s.snapshot);
  const [dtcs, setDtcs] = useState<DTC[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const stored = await transport.writeAndRead(ELM327Commands.readDTCs, 4000);
      const pending = await transport.writeAndRead(ELM327Commands.readPendingDTCs, 4000);
      const codes = [...parseDTCResponse(stored), ...parseDTCResponse(pending)];
      const dedup = new Map(codes.map((c) => [c.code, c]));
      const found = [...dedup.values()];
      setDtcs(found);

      const existing = await db.select().from(dtcRecords);
      const existingCodes = new Set(existing.map((r) => r.code));
      const freshlyDiscovered = found.filter((c) => !existingCodes.has(c.code));
      if (freshlyDiscovered.length > 0) {
        await db.insert(dtcRecords).values(
          freshlyDiscovered.map((c) => ({
            code: c.code,
            seenAt: Date.now(),
            status: c.status,
            freezeFrameJSON: JSON.stringify(snapshot),
          }))
        );
        useAlertEngine.getState().notifyNewDTCs(freshlyDiscovered);
      }
    } catch {
      setDtcs([]);
    } finally {
      setScanning(false);
    }
  }, [transport, snapshot]);

  const clearCodes = useCallback(async () => {
    await transport.writeAndRead(ELM327Commands.clearDTCs, 4000).catch(() => undefined);
    await db.delete(dtcRecords);
    setDtcs([]);
  }, [transport]);

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("scan.title")}</Text>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        <Pressable
          onPress={runScan}
          disabled={connection.status !== "connected" || scanning}
          style={[styles.actionButton, { backgroundColor: brandPrimary, opacity: connection.status === "connected" ? 1 : 0.5 }]}
        >
          {scanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionText}>{t("scan.startScan")}</Text>}
        </Pressable>

        {dtcs != null && dtcs.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
            <MaterialCommunityIcons name="check-circle" size={22} color={colors.semNominal} />
            <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s2 }}>{t("scan.noIssues")}</Text>
          </View>
        )}

        {dtcs != null &&
          dtcs.map((code) => (
            <Pressable
              key={code.code}
              onPress={() => router.push(`/dtc/${code.code}?status=${code.status}`)}
              style={[styles.card, { backgroundColor: colors.surface1 }]}
            >
              <MaterialCommunityIcons name="alert-circle" size={22} color={colors.semAttention} />
              <View style={{ marginLeft: DSSpace.s3, flex: 1 }}>
                <Text style={{ color: colors.contentPrimary, fontWeight: "700" }}>{code.code}</Text>
                <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{code.status}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
            </Pressable>
          ))}

        <Pressable onPress={() => router.push("/dtc-catalog")} style={[styles.card, { backgroundColor: colors.surface1 }]}>
          <MaterialCommunityIcons name="book-search" size={22} color={brandPrimary} />
          <Text style={{ color: colors.contentPrimary, marginLeft: DSSpace.s3, flex: 1 }}>{t("settings.dtcCatalog")}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
        </Pressable>

        {dtcs != null && dtcs.length > 0 && (
          <Pressable onPress={clearCodes} style={[styles.actionButton, { backgroundColor: colors.surface2 }]}>
            <Text style={[styles.actionText, { color: colors.contentPrimary }]}>{t("scan.clearCodes")}</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  actionButton: { padding: 14, borderRadius: DSRadius.card, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "700" },
  card: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
