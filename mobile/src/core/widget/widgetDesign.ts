/**
 * What a widget looks like, as data.
 *
 * The native side owns one flexible layout and no opinions: every design —
 * built-in or drawn by the user in the designer — is this object, resolved
 * against the current readings and handed over as a flat payload. Adding a
 * thirteenth design costs no Kotlin, and the in-app preview cannot drift from
 * the real widget because both render the same resolved payload.
 */

import {
  BAR_CAPABLE,
  isMetric,
  labelKeyFor,
  resolveMetric,
  type ResolvedMetric,
  type WidgetDataSet,
  type WidgetMetricId,
} from "./widgetMetrics";

export type WidgetPalette = "midnight" | "graphite" | "paper" | "blueprint" | "ember" | "forest";

export interface WidgetDesign {
  id: string;
  /** i18n key for a preset; user designs carry `customName` instead. */
  nameKey?: string;
  customName?: string;
  palette: WidgetPalette;
  /** Small strip of colour down the left edge. */
  accentStripe: boolean;
  /** Shown small at the top; usually the vehicle's name. */
  header: WidgetMetricId;
  /** The big number. */
  hero: WidgetMetricId;
  /** One line under the hero. */
  secondary: WidgetMetricId;
  /** Fills the bar. Null hides it. */
  bar: WidgetMetricId | null;
  /** Up to four small label/value cells along the bottom. */
  stats: WidgetMetricId[];
  /** Multiplier on the hero's type size, 0.7–1.5. */
  heroScale: number;
}

export const MAX_STATS = 4;
export const MIN_HERO_SCALE = 0.7;
export const MAX_HERO_SCALE = 1.5;

// --- palettes --------------------------------------------------------------

export interface PaletteColors {
  background: string;
  /** Header and stat labels. */
  muted: string;
  /** Hero and stat values. */
  primary: string;
  /** Bar fill, accent stripe. */
  accent: string;
  /** Bar track. */
  track: string;
}

/**
 * Fixed colours rather than the app's theme.
 *
 * A home-screen widget sits on the user's wallpaper, not inside the app, and
 * Android gives it no reliable way to follow the app's light/dark choice at
 * render time. Picking the palette explicitly is more honest than a widget that
 * changes appearance for reasons the user did not ask for.
 */
export const PALETTES: Record<WidgetPalette, PaletteColors> = {
  midnight: { background: "#0B0F14", muted: "#8B96A5", primary: "#F4F7FA", accent: "#1C6FE0", track: "#1E2630" },
  graphite: { background: "#181B20", muted: "#9AA3AF", primary: "#FFFFFF", accent: "#8B93A1", track: "#262A31" },
  paper: { background: "#F6F7F9", muted: "#6B7280", primary: "#111418", accent: "#1C6FE0", track: "#E2E5EA" },
  blueprint: { background: "#0A1E3A", muted: "#7FA3CC", primary: "#EAF2FB", accent: "#4FA8F5", track: "#122E52" },
  ember: { background: "#1A0F0C", muted: "#B08A7E", primary: "#FFF1EA", accent: "#F2703E", track: "#2E1A14" },
  forest: { background: "#0C1A12", muted: "#7FA890", primary: "#EAF6EE", accent: "#2FD07B", track: "#14291C" },
};

export const ALL_PALETTES = Object.keys(PALETTES) as WidgetPalette[];

// --- validation ------------------------------------------------------------

/**
 * Brings a design back into range.
 *
 * Designs arrive from storage written by an older build, or from a user
 * fiddling with the editor, so nothing is trusted: an unknown metric becomes
 * empty rather than rendering as a blank slot with no explanation, and a bar
 * bound to something that cannot fill one is dropped.
 */
export function normaliseDesign(input: Partial<WidgetDesign> & { id: string }): WidgetDesign {
  const metric = (value: unknown, fallback: WidgetMetricId): WidgetMetricId =>
    typeof value === "string" && isMetric(value) ? value : fallback;

  const bar = typeof input.bar === "string" && isMetric(input.bar) ? input.bar : null;

  return {
    id: input.id,
    nameKey: input.nameKey,
    customName: input.customName,
    palette: input.palette && input.palette in PALETTES ? input.palette : "midnight",
    accentStripe: input.accentStripe ?? false,
    header: metric(input.header, "vehicleName"),
    hero: metric(input.hero, "fuelLevel"),
    secondary: metric(input.secondary, "empty"),
    // A bar can only show a metric that has a natural full point.
    bar: bar && BAR_CAPABLE.has(bar) ? bar : null,
    stats: (Array.isArray(input.stats) ? input.stats : [])
      .filter((s): s is WidgetMetricId => typeof s === "string" && isMetric(s))
      .slice(0, MAX_STATS),
    heroScale: clampScale(input.heroScale),
  };
}

export function clampScale(value: unknown): number {
  const scale = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(Math.max(scale, MIN_HERO_SCALE), MAX_HERO_SCALE);
}

// --- resolution ------------------------------------------------------------

export interface ResolvedStat {
  labelKey: string;
  value: string;
}

/** A design plus the readings, flattened into what the renderer draws. */
export interface WidgetPayload {
  designId: string;
  colors: PaletteColors;
  accentStripe: boolean;
  header: string;
  hero: string;
  heroScale: number;
  secondary: string;
  /** -1 when the design has no bar, otherwise 0-100. */
  barPercent: number;
  stats: ResolvedStat[];
  recording: boolean;
  updatedAt: number;
}

export function resolveDesign(design: WidgetDesign, data: WidgetDataSet, now: number): WidgetPayload {
  const value = (metric: WidgetMetricId): ResolvedMetric => resolveMetric(metric, data);

  const bar = design.bar ? value(design.bar) : undefined;

  return {
    designId: design.id,
    colors: PALETTES[design.palette],
    accentStripe: design.accentStripe,
    header: value(design.header).value,
    hero: value(design.hero).value,
    heroScale: design.heroScale,
    secondary: value(design.secondary).value,
    // Negative rather than zero: an empty bar and no bar at all must not look
    // the same, or a car with no fuel reading would seem to be running on empty.
    barPercent: bar?.fraction != null ? Math.round(bar.fraction * 100) : -1,
    stats: design.stats.map((metric) => {
      const resolved = value(metric);
      return { labelKey: resolved.labelKey, value: resolved.value };
    }),
    recording: data.recording,
    updatedAt: now,
  };
}

/** The design's name, for lists and the designer. */
export function designName(design: WidgetDesign, t: (key: string) => string): string {
  if (design.customName) return design.customName;
  return design.nameKey ? t(design.nameKey) : design.id;
}

export function isCustom(design: WidgetDesign): boolean {
  return design.customName != null;
}

/** Metrics a design actually reads, for the designer's live-only warning. */
export function metricsUsedBy(design: WidgetDesign): WidgetMetricId[] {
  const used = [design.header, design.hero, design.secondary, ...design.stats];
  if (design.bar) used.push(design.bar);
  return [...new Set(used)].filter((m) => m !== "empty");
}

export { labelKeyFor };
