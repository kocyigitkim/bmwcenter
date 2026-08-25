import React, { useEffect, useState } from "react";
import { View, Text, Modal, TextInput, Pressable, StyleSheet, Switch } from "react-native";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useEffectivePricePerLiter } from "@/core/fuel/effectivePrice";
import type { RefuelEntry } from "@/core/storage/models";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: (entry: RefuelEntry) => void;
}

export function AddRefuelSheet({ visible, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const defaultPrice = useEffectivePricePerLiter();
  const [liters, setLiters] = useState("");
  const [pricePerLiter, setPricePerLiter] = useState(String(defaultPrice));

  useEffect(() => {
    if (visible) setPricePerLiter(String(defaultPrice));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  const [stationName, setStationName] = useState("");
  const [odometerKm, setOdometerKm] = useState("");
  const [note, setNote] = useState("");
  const [isFullTank, setIsFullTank] = useState(true);

  const litersNum = parseFloat(liters.replace(",", "."));
  const priceNum = parseFloat(pricePerLiter.replace(",", "."));
  const odometerNum = parseFloat(odometerKm.replace(",", "."));
  const valid = litersNum > 0 && priceNum > 0;

  const submit = () => {
    if (!valid) return;
    onSubmit({
      id: `refuel_${Date.now()}`,
      date: Date.now(),
      liters: litersNum,
      pricePerLiter: priceNum,
      totalCost: litersNum * priceNum,
      odometerKm: Number.isFinite(odometerNum) && odometerNum > 0 ? odometerNum : null,
      isFullTank,
      stationName: stationName || null,
      note: note || null,
    });
    setLiters("");
    setStationName("");
    setOdometerKm("");
    setNote("");
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.surface1 }]}>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>{t("fuel.addRefuel")}</Text>

          <Field label={t("unit.liter")}>
            <TextInput
              value={liters}
              onChangeText={setLiters}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.contentTertiary}
              style={[styles.input, { color: colors.contentPrimary, borderColor: colors.hairline }]}
            />
          </Field>

          <Field label={t("settings.pricePerLiter")}>
            <TextInput
              value={pricePerLiter}
              onChangeText={setPricePerLiter}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.contentTertiary}
              style={[styles.input, { color: colors.contentPrimary, borderColor: colors.hairline }]}
            />
          </Field>

          <Field label={t("fuel.station")}>
            <TextInput
              value={stationName}
              onChangeText={setStationName}
              placeholderTextColor={colors.contentTertiary}
              style={[styles.input, { color: colors.contentPrimary, borderColor: colors.hairline }]}
            />
          </Field>

          <Field label={t("fuel.odometer")}>
            <TextInput
              value={odometerKm}
              onChangeText={setOdometerKm}
              keyboardType="decimal-pad"
              placeholderTextColor={colors.contentTertiary}
              style={[styles.input, { color: colors.contentPrimary, borderColor: colors.hairline }]}
            />
          </Field>

          <Field label={t("common.note")}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholderTextColor={colors.contentTertiary}
              style={[styles.input, { color: colors.contentPrimary, borderColor: colors.hairline }]}
            />
          </Field>

          <View style={styles.switchRow}>
            <Text style={{ color: colors.contentPrimary }}>{t("fuel.fullTank")}</Text>
            <Switch value={isFullTank} onValueChange={setIsFullTank} />
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={onClose} style={[styles.button, { backgroundColor: colors.surface2 }]}>
              <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={!valid}
              style={[styles.button, { backgroundColor: brandPrimary, opacity: valid ? 1 : 0.5 }]}
            >
              <Text style={{ color: "#fff", fontWeight: "600" }}>{t("fuel.addRefuel")}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginBottom: DSSpace.s3 }}>
      <Text style={{ color: colors.contentSecondary, fontSize: 12, marginBottom: 4 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  sheet: { padding: DSSpace.cardPadding, borderTopLeftRadius: DSRadius.card, borderTopRightRadius: DSRadius.card, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: DSSpace.s4 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: 12, fontSize: 16 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: DSSpace.s4 },
  buttonRow: { flexDirection: "row", gap: DSSpace.s3 },
  button: { flex: 1, padding: 14, borderRadius: 12, alignItems: "center" },
});
