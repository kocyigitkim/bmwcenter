import React from "react";
import { View, Text, Modal, StyleSheet, Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, DSRadius, brandPrimary, withAlpha } from "@/design/tokens";
import { useAppSettings } from "@/core/settings/appSettings";
import { useTripRecorder } from "@/core/trip/tripRecorder";
import { tripNotification } from "@/core/notifications/tripNotification";

/**
 * Contextual pre-permission card, shown once — the first time a trip actually
 * starts. Explains why background tracking needs the notification permission
 * before the system dialog appears; asking with context measurably beats a
 * cold launch-time prompt. Declining is final here (no nagging); the settings
 * toggle re-runs the request.
 */
export function BackgroundPermissionSheet() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const state = useTripRecorder((s) => s.state);
  const done = useAppSettings((s) => s.backgroundPromptDone);
  const set = useAppSettings((s) => s.set);

  const tripActive = state.kind === "recording" || state.kind === "paused";
  const visible = tripActive && !done;

  const allow = async () => {
    set("backgroundPromptDone", true);
    await tripNotification.requestPermissions().catch(() => undefined);
  };

  const later = () => {
    set("backgroundPromptDone", true);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.canvasElevated }]}>
          <View style={[styles.icon, { backgroundColor: withAlpha(brandPrimary, 0.14) }]}>
            <MaterialCommunityIcons name="bell-badge-outline" size={26} color={brandPrimary} />
          </View>
          <Text style={[styles.title, { color: colors.contentPrimary }]}>
            {t("background.prompt.title")}
          </Text>
          <Text style={[styles.body, { color: colors.contentSecondary }]}>
            {t("background.prompt.body")}
          </Text>
          <Pressable onPress={allow} style={[styles.primary, { backgroundColor: brandPrimary }]}>
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {t("background.prompt.allow")}
            </Text>
          </Pressable>
          <Pressable onPress={later} style={styles.secondary} hitSlop={6}>
            <Text style={{ color: colors.contentSecondary, fontWeight: "600", fontSize: 14 }}>
              {t("background.prompt.later")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: DSSpace.s6,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: DSRadius.card,
    padding: DSSpace.s6,
    alignItems: "center",
  },
  icon: { width: 52, height: 52, borderRadius: 15, alignItems: "center", justifyContent: "center", marginBottom: DSSpace.s3 },
  title: { fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: DSSpace.s2 },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center", marginBottom: DSSpace.s5 },
  primary: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: 13,
    borderRadius: 14,
    marginBottom: DSSpace.s2,
  },
  secondary: { paddingVertical: DSSpace.s2 },
});
