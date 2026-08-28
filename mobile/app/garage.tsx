import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { Formatters } from "@/design/formatters";
import { useAppSettings } from "@/core/settings/appSettings";
import { useGarage } from "@/core/vehicle/useGarage";
import { displayedOdometerKm, type GarageVehicle } from "@/core/vehicle/vehicleRepository";

export default function GarageScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const settings = useAppSettings();
  const vehicles = useGarage((s) => s.vehicles);
  const activeId = useGarage((s) => s.activeId);
  const load = useGarage((s) => s.load);
  const setActive = useGarage((s) => s.setActive);
  const addVehicle = useGarage((s) => s.addVehicle);
  const removeVehicle = useGarage((s) => s.removeVehicle);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const confirmRemove = (vehicle: GarageVehicle) => {
    Alert.alert(t("garage.removeTitle", { name: vehicle.name }), t("garage.removeBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          const removed = await removeVehicle(vehicle.id);
          if (!removed) Alert.alert(t("garage.lastVehicleTitle"), t("garage.lastVehicleBody"));
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.canvas }}
      contentContainerStyle={{ paddingTop: insets.top + DSSpace.s4, paddingBottom: DSSpace.s8 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={brandPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("garage.title")}</Text>
      </View>

      <Text style={[styles.intro, { color: colors.contentSecondary }]}>{t("garage.intro")}</Text>

      <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
        {vehicles.map((v, i) => {
          const isActive = v.id === activeId;
          return (
            <Pressable
              key={v.id}
              onPress={() => setActive(v.id)}
              style={[
                styles.row,
                i > 0 && { borderTopColor: colors.hairline, borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <View
                style={[
                  styles.badge,
                  { backgroundColor: withAlpha(isActive ? brandPrimary : colors.contentTertiary, 0.14) },
                ]}
              >
                <MaterialCommunityIcons
                  name={isActive ? "car" : "car-outline"}
                  size={19}
                  color={isActive ? brandPrimary : colors.contentTertiary}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.contentPrimary, fontSize: 16, fontWeight: isActive ? "700" : "500" }}>
                  {v.name}
                </Text>
                <Text style={{ color: colors.contentSecondary, fontSize: 12 }}>
                  {Formatters.distance(displayedOdometerKm(v), settings)}
                  {v.vin ? ` · ${v.vin}` : ""}
                </Text>
              </View>
              {isActive && <MaterialCommunityIcons name="check" size={20} color={brandPrimary} />}
              <Pressable onPress={() => confirmRemove(v)} hitSlop={8} style={{ marginLeft: DSSpace.s3 }}>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.contentTertiary} />
              </Pressable>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{t("garage.addTitle")}</Text>
      <View style={[styles.card, { backgroundColor: colors.surface1, flexDirection: "row", alignItems: "center" }]}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder={t("garage.namePlaceholder")}
          placeholderTextColor={colors.contentTertiary}
          style={{ color: colors.contentPrimary, flex: 1, padding: DSSpace.s4, fontSize: 15 }}
        />
        <Pressable
          disabled={newName.trim().length === 0}
          onPress={async () => {
            const vehicle = await addVehicle(newName.trim());
            setNewName("");
            await setActive(vehicle.id);
          }}
          style={{ padding: DSSpace.s4, opacity: newName.trim().length === 0 ? 0.4 : 1 }}
        >
          <Text style={{ color: brandPrimary, fontWeight: "700" }}>{t("garage.add")}</Text>
        </Pressable>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.contentSecondary }]}>{t("garage.odometer")}</Text>
      <OdometerEditor />
    </ScrollView>
  );
}

/** The odometer we accumulate from recorded trips rarely matches the dash, so the
 * user sets the real reading and we store the difference as an offset. */
function OdometerEditor() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useAppSettings();
  const vehicles = useGarage((s) => s.vehicles);
  const activeId = useGarage((s) => s.activeId);
  const updateVehicle = useGarage((s) => s.updateVehicle);
  const vehicle = vehicles.find((v) => v.id === activeId);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (vehicle) setDraft(String(Math.round(displayedOdometerKm(vehicle))));
  }, [vehicle?.id, vehicle?.odometerKm, vehicle?.odometerOffsetKm]);

  if (!vehicle) return null;

  const save = () => {
    const entered = parseFloat(draft.replace(",", "."));
    if (Number.isNaN(entered)) return;
    updateVehicle(vehicle.id, { odometerOffsetKm: entered - vehicle.odometerKm });
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface1 }]}>
      <View style={[styles.row, { paddingVertical: DSSpace.s2 }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onBlur={save}
          keyboardType="decimal-pad"
          style={{ color: colors.contentPrimary, flex: 1, fontSize: 20, fontWeight: "700", paddingVertical: DSSpace.s2 }}
        />
        <Text style={{ color: colors.contentSecondary, fontSize: 15 }}>
          {settings.unitSystem === "metric" ? "km" : "mi"}
        </Text>
        <Pressable onPress={save} hitSlop={8} style={{ marginLeft: DSSpace.s4 }}>
          <Text style={{ color: brandPrimary, fontWeight: "700" }}>{t("common.save")}</Text>
        </Pressable>
      </View>
      <Text style={{ color: colors.contentTertiary, fontSize: 11, paddingHorizontal: DSSpace.s4, paddingBottom: DSSpace.s3 }}>
        {t("garage.odometerHint")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: DSSpace.s2, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s2 },
  title: { fontSize: 22, fontWeight: "700" },
  intro: { fontSize: 13, lineHeight: 18, paddingHorizontal: DSSpace.screenEdge, marginBottom: DSSpace.s4 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingHorizontal: DSSpace.screenEdge + DSSpace.s1,
    marginTop: DSSpace.s5,
    marginBottom: DSSpace.s2,
  },
  card: { marginHorizontal: DSSpace.screenEdge, borderRadius: DSRadius.card, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: DSSpace.s3, paddingHorizontal: DSSpace.s4, paddingVertical: 13 },
  badge: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
});
