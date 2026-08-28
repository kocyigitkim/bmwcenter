import { create } from "zustand";
import { storage } from "../settings/appSettings";
import {
  factoryLayout,
  sanitized,
  type DashboardLayout,
  type DashboardPreset,
} from "./dashboardLayout";
import { ALL_WIDGET_KINDS, type DashboardWidgetKind } from "./dashboardWidgetKind";
import { ALL_PRESETS } from "./dashboardLayout";

const STORAGE_KEY = "dashboard.layout.v1";
/** Pre-v1 builds wrote the layout here, and `appSettings` also owned a
 * `dashboardLayoutJSON` field pointing at the same key with a different encoding.
 * Read it once so existing customized layouts survive the move. */
const LEGACY_STORAGE_KEY = "settings.dashboardLayoutJSON";

const SCHEMA_VERSION = 1;

interface PersistedLayout extends DashboardLayout {
  schemaVersion: number;
}

const KNOWN_KINDS = new Set<string>(ALL_WIDGET_KINDS);
const KNOWN_PRESETS = new Set<string>(ALL_PRESETS);

/** Rejects anything that is not a usable layout, so a corrupt or foreign value falls
 * back to the factory layout instead of rendering an empty dashboard. */
export function parseLayout(raw: string | undefined): DashboardLayout | undefined {
  if (!raw) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  // The legacy appSettings writer double-encoded the value, so a string may come back.
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (typeof value !== "object" || value == null) return undefined;

  const candidate = value as Partial<PersistedLayout>;
  if (!Array.isArray(candidate.items)) return undefined;

  const items = candidate.items.filter(
    (it): it is { id: DashboardWidgetKind; size: "small" | "hero" } =>
      typeof it === "object" &&
      it != null &&
      KNOWN_KINDS.has((it as { id?: unknown }).id as string) &&
      ((it as { size?: unknown }).size === "small" || (it as { size?: unknown }).size === "hero")
  );

  const preset = KNOWN_PRESETS.has(candidate.preset as string)
    ? (candidate.preset as DashboardPreset)
    : "daily";

  return sanitized({
    preset,
    isCustomized: candidate.isCustomized === true,
    items,
  });
}

function load(): DashboardLayout {
  const parsed = parseLayout(storage.getString(STORAGE_KEY)) ?? parseLayout(storage.getString(LEGACY_STORAGE_KEY));
  if (!parsed) return factoryLayout("daily");
  // A customized layout that validated down to nothing would render an empty dashboard;
  // the factory layout is a better answer than a blank screen.
  if (parsed.items.length === 0) return factoryLayout(parsed.preset);
  return parsed;
}

function persist(layout: DashboardLayout) {
  const payload: PersistedLayout = { ...layout, schemaVersion: SCHEMA_VERSION };
  storage.set(STORAGE_KEY, JSON.stringify(payload));
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
