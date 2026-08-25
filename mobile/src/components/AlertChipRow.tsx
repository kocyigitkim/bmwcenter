import React from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTheme } from "@/design/theme";
import { DSSpace, withAlpha } from "@/design/tokens";
import { useAlertEngine } from "@/core/alerts/alertEngine";
import { useCareCoordinator } from "@/core/care/careCoordinator";
import type { AlertSeverity } from "@/core/alerts/alertTypes";

const SEVERITY_ICON: Record<AlertSeverity, keyof typeof MaterialCommunityIcons.glyphMap> = {
  info: "information",
  warning: "alert",
  critical: "alert-octagon",
};

export function AlertChipRow() {
  const { colors } = useTheme();
  const ruleAlerts = useAlertEngine((s) => s.activeAlerts);
  const stickyAlerts = useAlertEngine((s) => s.stickyAlerts);
  const dismissSticky = useAlertEngine((s) => s.dismissSticky);
  const careChips = useCareCoordinator((s) => s.activeChips);
  const stickyIds = new Set(stickyAlerts.map((a) => a.id));
  const seen = new Set<string>();
  const alerts = [...stickyAlerts, ...ruleAlerts, ...careChips].filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));

  if (alerts.length === 0) return null;

  const colorFor = (severity: AlertSeverity) =>
    severity === "critical" ? colors.semCritical : severity === "warning" ? colors.semAttention : colors.semInfo;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {alerts.map((alert) => {
        const color = colorFor(alert.severity);
        const dismissible = stickyIds.has(alert.id);
        const Chip = (
          <View style={[styles.chip, { backgroundColor: withAlpha(color, 0.15), borderColor: color }]}>
            <MaterialCommunityIcons name={SEVERITY_ICON[alert.severity]} size={14} color={color} />
            <Text style={{ color, fontSize: 12, fontWeight: "600", marginLeft: 4 }} numberOfLines={1}>
              {alert.title}
            </Text>
            {dismissible && <MaterialCommunityIcons name="close" size={13} color={color} style={{ marginLeft: 6 }} />}
          </View>
        );
        return dismissible ? (
          <Pressable key={alert.id} onPress={() => dismissSticky(alert.id)}>
            {Chip}
          </Pressable>
        ) : (
          <View key={alert.id}>{Chip}</View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: DSSpace.screenEdge, paddingBottom: DSSpace.s3 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
