import React, { useMemo, useState } from "react";
import { View, Text, Modal, ScrollView, StyleSheet, Pressable, TextInput } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import {
  allMakes,
  engineLabelFor,
  loadBundledPack,
  modelsForMake,
  type ModelEntry,
} from "@/core/vehicle/vehicleProfilePack";

interface Props {
  visible: boolean;
  onClose: () => void;
  /** `entry` is undefined when the user picks a make with no specific model — the brand
   * layer still gives better thresholds than the generic archetype. */
  onSelect: (make: string, entry: ModelEntry | undefined) => void;
}

export function VehiclePickerSheet({ visible, onClose, onSelect }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const pack = useMemo(() => loadBundledPack(), []);
  const [query, setQuery] = useState("");
  const [make, setMake] = useState<string | undefined>(undefined);

  const makes = useMemo(() => {
    const all = allMakes(pack);
    const q = query.trim().toLowerCase();
    return q ? all.filter((m) => m.toLowerCase().includes(q)) : all;
  }, [pack, query]);

  const models = useMemo(() => (make ? modelsForMake(pack, make) : []), [pack, make]);

  const close = () => {
    setMake(undefined);
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.canvas }}>
        <View style={[styles.header, { borderBottomColor: colors.hairline }]}>
          <Pressable onPress={make ? () => setMake(undefined) : close} hitSlop={8}>
            <MaterialCommunityIcons name={make ? "chevron-left" : "close"} size={26} color={brandPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>
            {make ?? t("settings.vehicle.pickMake")}
          </Text>
        </View>

        {!make && (
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t("settings.vehicle.searchMake")}
            placeholderTextColor={colors.contentTertiary}
            autoCorrect={false}
            style={[styles.search, { color: colors.contentPrimary, backgroundColor: colors.surface1 }]}
          />
        )}

        <ScrollView contentContainerStyle={{ padding: DSSpace.screenEdge, gap: DSSpace.s2 }}>
          {!make &&
            makes.map((m) => (
              <Pressable key={m} onPress={() => setMake(m)} style={[styles.row, { backgroundColor: colors.surface1 }]}>
                <Text style={{ color: colors.contentPrimary, flex: 1 }}>{m}</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color={colors.contentTertiary} />
              </Pressable>
            ))}

          {make && (
            <>
              <Pressable
                onPress={() => {
                  onSelect(make, undefined);
                  close();
                }}
                style={[styles.row, { backgroundColor: colors.surface1 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.contentPrimary }}>{t("settings.vehicle.makeOnly")}</Text>
                  <Text style={{ color: colors.contentTertiary, fontSize: 11 }}>
                    {t("settings.vehicle.makeOnlyHint")}
                  </Text>
                </View>
              </Pressable>
              {models.map((entry) => (
                <Pressable
                  key={entry.id}
                  onPress={() => {
                    onSelect(make, entry);
                    close();
                  }}
                  style={[styles.row, { backgroundColor: colors.surface1 }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>{entry.model}</Text>
                    <Text style={{ color: colors.contentSecondary, fontSize: 11 }}>
                      {engineLabelFor(entry)} · {t("settings.vehicle.thermostat", { value: entry.tstat })}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: DSSpace.s2,
    padding: DSSpace.screenEdge,
    paddingTop: DSSpace.s8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 20, fontWeight: "700", flex: 1 },
  search: {
    marginHorizontal: DSSpace.screenEdge,
    marginTop: DSSpace.s3,
    padding: DSSpace.s3,
    borderRadius: DSRadius.card,
  },
  row: { flexDirection: "row", alignItems: "center", padding: DSSpace.cardPadding, borderRadius: DSRadius.card },
});
