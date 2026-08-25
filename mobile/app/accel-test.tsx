import React, { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useOBDStore } from "@/core/obd/obdService";
import { db } from "@/core/storage/db";
import { accelRecords } from "@/core/storage/schema";
import { maintenanceRepository } from "@/core/storage/maintenanceRepository";
import { useCareCoordinator } from "@/core/care/careCoordinator";
import type { accelRecords as AccelRecordsTable } from "@/core/storage/schema";

export default function AccelTestScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const snapshot = useOBDStore((s) => s.snapshot);
  const connection = useOBDStore((s) => s.connection);
  const isEngineReady = useCareCoordinator((s) => s.isEngineReady);
  const readinessLabel = useCareCoordinator((s) => s.readinessLabel);
  const [armed, setArmed] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [runs, setRuns] = useState<(typeof AccelRecordsTable.$inferSelect)[]>([]);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    maintenanceRepository.accelHistory().then(setRuns);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const speed = snapshot.speedKmh ?? 0;
    if (startedAt.current == null && speed <= 1) {
      startedAt.current = Date.now();
    } else if (startedAt.current != null && speed >= 100) {
      const t0to100 = (Date.now() - startedAt.current) / 1000;
      setElapsed(t0to100);
      setArmed(false);
      db.insert(accelRecords)
        .values({ date: Date.now(), t0to100, sampleRateHz: 4 })
        .then(() => maintenanceRepository.accelHistory().then(setRuns));
      startedAt.current = null;
    }
  }, [snapshot.speedKmh, armed]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas, paddingTop: insets.top + DSSpace.s4 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("accel.title")}</Text>
      </View>

      <View style={{ paddingHorizontal: DSSpace.screenEdge, gap: DSSpace.cardGap }}>
        {elapsed != null && (
          <View style={[styles.row, { backgroundColor: colors.surface1, justifyContent: "center" }]}>
            <Text style={{ color: colors.contentPrimary, fontSize: 34, fontWeight: "700" }}>{elapsed.toFixed(2)}s</Text>
          </View>
        )}
        <Pressable
          onPress={() => {
            setElapsed(null);
            startedAt.current = null;
            setArmed(true);
          }}
          disabled={connection.status !== "connected" || armed || !isEngineReady}
          style={[
            styles.actionButton,
            { backgroundColor: brandPrimary, opacity: connection.status === "connected" && !armed && isEngineReady ? 1 : 0.5 },
          ]}
        >
          <Text style={styles.actionText}>{armed ? "…" : t("accel.start")}</Text>
        </Pressable>
        {!isEngineReady && connection.status === "connected" && (
          <Text style={{ color: colors.contentTertiary, textAlign: "center", fontSize: 12 }}>
            {t("accel.notReady", { defaultValue: readinessLabel ?? "Warming up…" })}
          </Text>
        )}

        <ScrollView contentContainerStyle={{ gap: DSSpace.cardGap, paddingBottom: DSSpace.s8 }}>
          {runs.length === 0 ? (
            <Text style={{ color: colors.contentTertiary, textAlign: "center", marginTop: 20 }}>{t("accel.empty")}</Text>
          ) : (
            runs.map((r) => (
              <View key={r.id} style={[styles.row, { backgroundColor: colors.surface1 }]}>
                <Text style={{ color: colors.contentPrimary }}>{new Date(r.date).toLocaleDateString()}</Text>
                <Text style={{ color: colors.contentPrimary, fontWeight: "700" }}>{r.t0to100?.toFixed(2)}s</Text>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
  actionButton: { padding: 14, borderRadius: DSRadius.card, alignItems: "center" },
  actionText: { color: "#fff", fontWeight: "700" },
});
