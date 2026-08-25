export const DSSpace = {
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s7: 32,
  s8: 40,
  screenEdge: 20,
  cardPadding: 18,
  cardGap: 12,
  minTouch: 44,
} as const;

export const DSRadius = {
  card: 26,
  tile: 22,
  chip: 999,
  bar: 6,
} as const;

export const DSFont = {
  display: 48,
  metricXL: 34,
  metricL: 26,
  unit: 13,
  title: 17,
  label: 13,
  caption: 11,
  mono: 13,
} as const;

export type SemanticColor = "nominal" | "attention" | "critical" | "cold" | "inactive" | "info";

interface Hex {
  light: number;
  dark: number;
}

function toRgba(hex: number, opacity = 1): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** Returns a copy of an `rgba(r, g, b, a)` string with a new alpha. */
export function withAlpha(rgba: string, alpha: number): string {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgba);
  if (!match) return rgba;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

const raw = {
  canvas: { light: 0xf2f4f7, dark: 0x07090c },
  canvasElevated: { light: 0xffffff, dark: 0x0d1116 },
  surface1: { light: 0xffffff, dark: 0x12171e },
  surface2: { light: 0xeef1f5, dark: 0x1a212a },
  surface3: { light: 0xe2e7ed, dark: 0x232c37 },
  hairline: { light: 0xd7dde5, dark: 0x2b3541 },

  contentPrimary: { light: 0x0b0f14, dark: 0xf4f7fa },
  contentSecondary: { light: 0x5a6473, dark: 0x9ba6b4 },
  contentTertiary: { light: 0x8a929e, dark: 0x66707e },

  semNominal: { light: 0x1e9e58, dark: 0x2fd07b },
  semAttention: { light: 0xc4822a, dark: 0xf2b23e },
  semCritical: { light: 0xd22c2e, dark: 0xff4d4f },
  semCold: { light: 0x2a76be, dark: 0x4fa8f5 },
  semInactive: { light: 0xa7aeb8, dark: 0x4a5462 },
  semInfo: { light: 0x5849c7, dark: 0x7c6cf5 },
} satisfies Record<string, Hex>;

export const brandPrimary = toRgba(0x1c6fe0);
export const brandSecondary = toRgba(0x6e4a9e);

export function colorsFor(scheme: "light" | "dark") {
  const entries = Object.entries(raw).map(([key, value]) => [key, toRgba(scheme === "dark" ? value.dark : value.light)]);
  return Object.fromEntries(entries) as Record<keyof typeof raw, string>;
}

export const semanticColorKey: Record<SemanticColor, keyof typeof raw> = {
  nominal: "semNominal",
  attention: "semAttention",
  critical: "semCritical",
  cold: "semCold",
  inactive: "semInactive",
  info: "semInfo",
};
