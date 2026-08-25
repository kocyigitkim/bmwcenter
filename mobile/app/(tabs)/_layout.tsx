import React from "react";
import { Tabs } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useTheme } from "@/design/theme";

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1C6FE0",
        tabBarInactiveTintColor: colors.contentTertiary,
        tabBarStyle: { backgroundColor: colors.surface1, borderTopColor: colors.hairline },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tab.dashboard"),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="view-dashboard" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: t("tab.fuel"),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="gas-station" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="trips"
        options={{
          title: t("tab.trips"),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="map-marker-path" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t("tab.insights"),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="chart-line" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tab.settings"),
          tabBarIcon: ({ color, size }) => <MaterialCommunityIcons name="cog" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
