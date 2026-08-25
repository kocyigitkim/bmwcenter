import React, { useRef } from "react";
import { View, Text, Modal, Pressable, StyleSheet } from "react-native";
import { useTranslation } from "react-i18next";
import * as Sharing from "expo-sharing";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary } from "@/design/tokens";
import { useCareCoordinator } from "@/core/care/careCoordinator";
import { TripSummaryCardView } from "./TripSummaryCardView";

export function TripSummaryCardModal() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const model = useCareCoordinator((s) => s.tripSummaryCard);
  const dismiss = useCareCoordinator((s) => s.dismissTripCard);
  const shotRef = useRef<ViewShotRef>(null);

  const share = async () => {
    const uri = await shotRef.current?.capture?.();
    if (uri && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri);
  };

  return (
    <Modal visible={!!model} animationType="slide" transparent onRequestClose={dismiss}>
      <View style={styles.backdrop}>
        {model && (
          <>
            <ViewShot ref={shotRef} options={{ format: "png", quality: 1 }}>
              <TripSummaryCardView model={model} />
            </ViewShot>
            <View style={styles.buttonRow}>
              <Pressable onPress={dismiss} style={[styles.button, { backgroundColor: colors.surface2 }]}>
                <Text style={{ color: colors.contentPrimary, fontWeight: "600" }}>{t("common.done")}</Text>
              </Pressable>
              <Pressable onPress={share} style={[styles.button, { backgroundColor: brandPrimary }]}>
                <Text style={{ color: "#fff", fontWeight: "600" }}>{t("common.share", { defaultValue: "Share" })}</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", gap: DSSpace.s4 },
  buttonRow: { flexDirection: "row", gap: DSSpace.s3, marginTop: DSSpace.s4 },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: DSRadius.card },
});
