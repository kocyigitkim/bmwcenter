import React, { useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Switch, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useAppSettings, type FuelType } from "@/core/settings/appSettings";
import { useOBDStore } from "@/core/obd/obdService";

const FUEL_TYPES: FuelType[] = ["gasoline", "diesel", "lpg"];

export default function VehicleProfileScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const readVIN = useOBDStore((s) => s.readVIN);
  const connection = useOBDStore((s) => s.connection);
  const [reading, setReading] = useState(false);

  const onReadVIN = async () => {
    setReading(true);
    try {
      const vin = await readVIN();
      if (vin) settings.set("lastVIN", vin);
    } finally {
      setReading(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.canvas }} contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("settings.vehicle")}</Text>
      </View>

      <Section title={t("settings.vehicle.identity")}>
        <View style={styles.row}>
          <TextInput
            value={settings.vehicleName}
            onChangeText={(v) => settings.set("vehicleName", v)}
            placeholder={t("settings.vehicle.placeholderName")}
            placeholderTextColor={colors.contentTertiary}
            style={{ color: colors.contentPrimary, flex: 1 }}
          />
        </View>
      </Section>

      <Section title={t("settings.vehicle.vin")}>
        <View style={styles.row}>
          <TextInput
            value={settings.lastVIN}
            onChangeText={(v) => settings.set("lastVIN", v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            style={{ color: colors.contentPrimary, flex: 1, fontFamily: "Menlo" }}
          />
        </View>
        <Pressable onPress={onReadVIN} disabled={connection.status !== "connected" || reading} style={styles.actionRow}>
          {reading ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ color: brandPrimary, fontWeight: "600" }}>{t("settings.vehicle.readVIN")}</Text>
          )}
        </Pressable>
      </Section>

      <Section title={t("settings.vehicle.overrides")}>
        <View style={[styles.row, { flexDirection: "column", alignItems: "stretch" }]}>
          <Text style={{ color: colors.contentPrimary, marginBottom: 6 }}>{t("settings.fuelType")}</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {FUEL_TYPES.map((ft) => (
              <Pressable
                key={ft}
                onPress={() => settings.set("fuelType", ft)}
                style={[styles.chip, { backgroundColor: ft === settings.fuelType ? brandPrimary : colors.surface2 }]}
              >
                <Text style={{ color: ft === settings.fuelType ? "#fff" : colors.contentPrimary, fontSize: 12, fontWeight: "600" }}>
                  {t(`fuelType.${ft}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t("settings.vehicle.isTurbo")}</Text>
          <Switch value={settings.isTurbo} onValueChange={(v) => settings.set("isTurbo", v)} />
        </View>
        <View style={styles.row}>
          <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t("settings.tankCapacity")}</Text>
          <TextInput
            value={String(settings.tankCapacityL)}
            onChangeText={(v) => {
              const n = parseFloat(v.replace(",", "."));
              if (!Number.isNaN(n)) settings.set("tankCapacityL", n);
            }}
            keyboardType="decimal-pad"
            style={{ color: colors.contentPrimary, textAlign: "right", minWidth: 60 }}
          />
        </View>
        <View style={styles.row}>
          <Text style={{ color: colors.contentPrimary, flex: 1 }}>{t("settings.displacement")}</Text>
          <TextInput
            value={String(settings.displacementL)}
            onChangeText={(v) => {
              const n = parseFloat(v.replace(",", "."));
              if (!Number.isNaN(n)) settings.set("displacementL", n);
            }}
            keyboardType="decimal-pad"
            style={{ color: colors.contentPrimary, textAlign: "right", minWidth: 60 }}
          />
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s5 }}>
      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: colors.surface1 }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  title: { fontSize: 22, fontWeight: "700" },
  sectionTitle: { fontSize: 12, fontWeight: "600", textTransform: "uppercase", paddingHorizontal: DSSpace.screenEdge + DSSpace.s1, marginBottom: DSSpace.s2 },
  sectionCard: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, padding: DSSpace.s2 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: DSSpace.s3, paddingVertical: DSSpace.s3 },
  actionRow: { paddingHorizontal: DSSpace.s3, paddingBottom: DSSpace.s3 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
});
