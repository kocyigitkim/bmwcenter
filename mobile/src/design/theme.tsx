import React, { createContext, useContext, useMemo } from "react";
import { useColorScheme } from "react-native";
import { colorsFor } from "./tokens";
import { useAppSettings } from "@/core/settings/appSettings";

type Palette = ReturnType<typeof colorsFor>;

const ThemeContext = createContext<{ colors: Palette; scheme: "light" | "dark" }>({
  colors: colorsFor("light"),
  scheme: "light",
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const themeMode = useAppSettings((s) => s.themeMode);
  const scheme: "light" | "dark" =
    themeMode === "system" ? (systemScheme === "dark" ? "dark" : "light") : themeMode;
  const value = useMemo(() => ({ colors: colorsFor(scheme), scheme }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
