import { create } from "zustand";
import { storage } from "../settings/appSettings";
import {
  factoryLayout,
  sanitized,
  type DashboardLayout,
  type DashboardPreset,
} from "./dashboardLayout";

function load(): DashboardLayout {
  const raw = storage.getString("settings.dashboardLayoutJSON");
  if (!raw) return factoryLayout("daily");
  try {
    const parsed = JSON.parse(raw) as DashboardLayout;
    return sanitized(parsed);
  } catch {
    return factoryLayout("daily");
  }
}

function persist(layout: DashboardLayout) {
  storage.set("settings.dashboardLayoutJSON", JSON.stringify(layout));
}

interface DashboardLayoutState {
  layout: DashboardLayout;
  setLayout: (layout: DashboardLayout) => void;
  applyPreset: (preset: DashboardPreset) => void;
}

export const useDashboardLayout = create<DashboardLayoutState>((set) => ({
  layout: load(),
  setLayout: (layout) => {
    persist(layout);
    set({ layout });
  },
  applyPreset: (preset) => {
    const layout = factoryLayout(preset);
    persist(layout);
    set({ layout });
  },
}));
