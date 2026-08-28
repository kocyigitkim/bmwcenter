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
import { readinessVerdict, type ReadinessStatus } from "@/core/obd/readiness";
import { activeVehicleId } from "@/core/vehicle/useGarage";
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
  const [readiness, setReadiness] = useState<ReadinessStatus | undefined>();
  const [scanning, setScanning] = useState(false);
  const readReadiness = useOBDStore((s) => s.readReadiness);
  const readFreezeFrame = useOBDStore((s) => s.readFreezeFrame);

  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      const stored = await transport.writeAndRead(ELM327Commands.readDTCs, 4000);
      const pending = await transport.writeAndRead(ELM327Commands.readPendingDTCs, 4000);
      // Permanent codes cannot be cleared with Mode 04 and are what an inspection
      // actually blocks on, so they must be read and labelled separately.
      const permanent = await transport
        .writeAndRead(ELM327Commands.readPermanentDTCs, 4000)
        .catch(() => "NO DATA");
      const codes = [
        ...parseDTCResponse(stored, "stored"),
        ...parseDTCResponse(pending, "pending"),
        ...parseDTCResponse(permanent, "permanent"),
      ];
      // A code present in several services keeps the most serious label.
      const rank: Record<string, number> = { pending: 0, stored: 1, permanent: 2 };
      const dedup = new Map<string, DTC>();
      for (const c of codes) {
        const prev = dedup.get(c.code);
        if (!prev || rank[c.status]! > rank[prev.status]!) dedup.set(c.code, c);
      }
      const found = [...dedup.values()];
      setDtcs(found);

      setReadiness(await readReadiness());
      const frame = found.length > 0 ? await readFreezeFrame() : undefined;

      const existing = await db.select().from(dtcRecords);
      const existingCodes = new Set(existing.map((r) => r.code));
      const freshlyDiscovered = found.filter((c) => !existingCodes.has(c.code));
      if (freshlyDiscovered.length > 0) {
        await db.insert(dtcRecords).values(
          freshlyDiscovered.map((c) => ({
            vehicleId: activeVehicleId(),
            code: c.code,
            seenAt: Date.now(),
            status: c.status,
            freezeFrameJSON: frame ? JSON.stringify(frame) : null,
          }))
        );
        useAlertEngine.getState().notifyNewDTCs(freshlyDiscovered);
      }
    } catch {
      setDtcs([]);
    } finally {
      setScanning(false);
    }
  }, [transport, readReadiness, readFreezeFrame]);

  const clearCodes = useCallback(async () => {
    await transport.writeAndRead(ELM327Commands.clearDTCs, 4000).catch(() => undefined);
    await db.delete(dtcRecords);
    // Mode 04 does not erase permanent codes, and it resets every readiness
    // monitor — re-reading is the only honest way to show what is left.
    await runScan();
  }, [transport, runScan]);

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

        {readiness && (
          <View style={[styles.card, { backgroundColor: colors.surface1, flexDirection: "column", alignItems: "stretch" }]}>
            <View style={styles.readinessHeader}>
              <MaterialCommunityIcons
                name={readinessVerdict(readiness) === "ready" ? "leaf" : "leaf-off"}
                size={20}
                color={readinessVerdict(readiness) === "ready" ? colors.semNominal : colors.semAttention}
              />
              <Text style={{ color: colors.contentPrimary, fontWeight: "700", flex: 1, marginLeft: DSSpace.s2 }}>
                {t("readiness.title")}
              </Text>
              <Text
                style={{
                  color: readinessVerdict(readiness) === "ready" ? colors.semNominal : colors.semAttention,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                {t(`readiness.verdict.${readinessVerdict(readiness)}`)}
              </Text>
            </View>
            <Text style={{ color: colors.contentSecondary, fontSize: 12, marginBottom: DSSpace.s2 }}>
              {readiness.milOn ? t("readiness.milOn", { count: readiness.dtcCount }) : t("readiness.milOff")}
            </Text>
            {readiness.monitors
              .filter((m) => m.supported)
              .map((m) => (
                <View key={m.key} style={styles.monitorRow}>
                  <MaterialCommunityIcons
                    name={m.complete ? "check-circle" : "progress-clock"}
                    size={15}
                    color={m.complete ? colors.semNominal : colors.semAttention}
                  />
                  <Text style={{ color: colors.contentPrimary, fontSize: 13, marginLeft: DSSpace.s2, flex: 1 }}>
                    {t(`obd.monitor.${m.key}`)}
                  </Text>
                  <Text style={{ color: colors.contentTertiary, fontSize: 12 }}>
                    {t(m.complete ? "readiness.complete" : "readiness.incomplete")}
                  </Text>
                </View>
              ))}
          </View>
        )}

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
                <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>{t(`dtc.status.${code.status}`)}</Text>
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
  readinessHeader: { flexDirection: "row", alignItems: "center", marginBottom: DSSpace.s2 },
  monitorRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5 },
});
