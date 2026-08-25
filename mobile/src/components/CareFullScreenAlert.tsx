import React from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius } from "@/design/tokens";
import { useCareCoordinator } from "@/core/care/careCoordinator";

/** Full-screen modal interrupt for critical Care cues (overheat, coolant) — a phone
 * chip alone is too easy to miss while driving. */
export function CareFullScreenAlert() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const cue = useCareCoordinator((s) => s.fullScreenCue);
  const dismiss = useCareCoordinator((s) => s.dismissFullScreenCue);

  return (
    <Modal visible={!!cue} animationType="fade" transparent>
      <View style={[styles.backdrop, { backgroundColor: colors.semCritical }]}>
        <MaterialCommunityIcons name="alert-octagon" size={64} color="#fff" />
        <Text style={styles.text}>{cue?.text}</Text>
        <Pressable onPress={dismiss} style={styles.button}>
          <Text style={styles.buttonText}>{t("common.done")}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: DSSpace.screenEdge * 2 },
  text: { color: "#fff", fontSize: 22, fontWeight: "700", textAlign: "center", marginTop: DSSpace.s6, marginBottom: DSSpace.s8 },
  button: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 32, paddingVertical: 14, borderRadius: DSRadius.card },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
