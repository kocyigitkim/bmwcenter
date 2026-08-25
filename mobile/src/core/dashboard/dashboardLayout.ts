import {
  RESERVED_PINNED_CHROME_IDS,
  defaultSize,
  isPairableHero,
  type DashboardWidgetKind,
  type DashboardWidgetSize,
} from "./dashboardWidgetKind";

export type DashboardPreset =
  | "daily"
  | "performance"
  | "fuel"
  | "diagnostics"
  | "cooling"
  | "turbo"
  | "transmission";

export const ALL_PRESETS: DashboardPreset[] = [
  "daily",
  "performance",
  "fuel",
  "diagnostics",
  "cooling",
  "turbo",
  "transmission",
];

export interface DashboardWidgetItem {
  id: DashboardWidgetKind;
  size: DashboardWidgetSize;
}

export interface DashboardLayout {
  preset: DashboardPreset;
  isCustomized: boolean;
  items: DashboardWidgetItem[];
}

function item(id: DashboardWidgetKind, size?: DashboardWidgetSize): DashboardWidgetItem {
  return { id, size: size ?? defaultSize(id) };
}

/** PRD §40 factory layouts. Daily is the default; it never includes extended OEM sensors
 * or less-common PIDs (MAP / IAT / STFT / LTFT). */
export function itemsForPreset(preset: DashboardPreset): DashboardWidgetItem[] {
  switch (preset) {
    case "daily":
      return [
        item("speed", "hero"),
        item("rpm", "hero"),
        item("coolant", "small"),
        item("fuelLevel", "small"),
        item("voltage", "small"),
        item("dailyFuel", "hero"),
        item("vehicleScan", "hero"),
      ];
    case "performance":
      return [
        item("rpm", "hero"),
        item("boost", "small"),
        item("boostSetpoint", "small"),
        item("iat", "small"),
        item("ignitionAdvance", "small"),
        item("fuelRail", "small"),
      ];
    case "fuel":
      return [
        item("instantConsumption", "hero"),
        item("dailyFuel", "hero"),
        item("fuelLevel", "small"),
        item("range", "small"),
        item("ecoScore", "small"),
      ];
    case "diagnostics":
      return [
        item("engineLoad", "small"),
        item("throttle", "small"),
        item("stft", "small"),
        item("ltft", "small"),
        item("maf", "small"),
        item("map", "small"),
        item("vehicleScan", "hero"),
      ];
    case "cooling":
      return [
        item("coolant", "hero"),
        item("oilTemp", "hero"),
        item("radiatorOutlet", "small"),
        item("intercooler", "small"),
        item("ambient", "small"),
      ];
    case "turbo":
      return [
        item("boost", "hero"),
        item("iat", "small"),
        item("intercooler", "small"),
        item("oilTemp", "small"),
      ];
    case "transmission":
      return [
        item("transmissionOilTemp", "hero"),
        item("engineLoad", "small"),
        item("throttle", "small"),
        item("pedal", "small"),
      ];
  }
}

export function factoryLayout(preset: DashboardPreset): DashboardLayout {
  return { preset, isCustomized: false, items: itemsForPreset(preset) };
}

export function sanitized(layout: DashboardLayout): DashboardLayout {
  const seen = new Set<DashboardWidgetKind>();
  const filtered = layout.items.filter((it) => {
    if (RESERVED_PINNED_CHROME_IDS.has(it.id)) return false;
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
  return { ...layout, items: filtered };
}

export function hideWidget(layout: DashboardLayout, kind: DashboardWidgetKind): DashboardLayout {
  const before = layout.items.length;
  const items = layout.items.filter((it) => it.id !== kind);
  return { ...layout, items, isCustomized: items.length !== before ? true : layout.isCustomized };
}

export function addWidget(
  layout: DashboardLayout,
  kind: DashboardWidgetKind,
  size?: DashboardWidgetSize
): DashboardLayout {
  if (layout.items.some((it) => it.id === kind)) return layout;
  return {
    ...layout,
    items: [...layout.items, item(kind, size)],
    isCustomized: true,
  };
}

export function setWidgetSize(
  layout: DashboardLayout,
  kind: DashboardWidgetKind,
  size: DashboardWidgetSize
): DashboardLayout {
  const index = layout.items.findIndex((it) => it.id === kind);
  if (index < 0 || layout.items[index]!.size === size) return layout;
  const items = [...layout.items];
  items[index] = { ...items[index]!, size };
  return { ...layout, items, isCustomized: true };
}

export function moveBefore(
  layout: DashboardLayout,
  kind: DashboardWidgetKind,
  destination: DashboardWidgetKind
): DashboardLayout {
  if (kind === destination) return layout;
  const from = layout.items.findIndex((it) => it.id === kind);
  if (from < 0 || !layout.items.some((it) => it.id === destination)) return layout;
  const items = [...layout.items];
  const [moved] = items.splice(from, 1);
  const insertAt = items.findIndex((it) => it.id === destination);
  items.splice(insertAt < 0 ? items.length : insertAt, 0, moved!);
  return { ...layout, items, isCustomized: true };
}

export function moveOffset(layout: DashboardLayout, kind: DashboardWidgetKind, offset: number): DashboardLayout {
  const from = layout.items.findIndex((it) => it.id === kind);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= layout.items.length) return layout;
  const items = [...layout.items];
  [items[from], items[to]] = [items[to]!, items[from]!];
  return { ...layout, items, isCustomized: true };
}

export function applyPreset(preset: DashboardPreset): DashboardLayout {
  return factoryLayout(preset);
}

export function placedKinds(layout: DashboardLayout): Set<DashboardWidgetKind> {
  return new Set(layout.items.map((it) => it.id));
}

export type DashboardLayoutRow =
  | { kind: "dualHero"; a: DashboardWidgetItem; b: DashboardWidgetItem }
  | { kind: "hero"; item: DashboardWidgetItem }
  | { kind: "pair"; a: DashboardWidgetItem; b: DashboardWidgetItem | null };

export function rowKey(row: DashboardLayoutRow): string {
  switch (row.kind) {
    case "dualHero":
      return `dual-${row.a.id}-${row.b.id}`;
    case "hero":
      return `hero-${row.item.id}`;
    case "pair":
      return `pair-${row.a.id}-${row.b?.id ?? "none"}`;
  }
}

export function packedRows(layout: DashboardLayout): DashboardLayoutRow[] {
  const rows: DashboardLayoutRow[] = [];
  let smalls: DashboardWidgetItem[] = [];
  let index = 0;

  function flushSmalls() {
    let i = 0;
    while (i < smalls.length) {
      const first = smalls[i]!;
      const second = i + 1 < smalls.length ? smalls[i + 1]! : null;
      rows.push({ kind: "pair", a: first, b: second });
      i += second == null ? 1 : 2;
    }
    smalls = [];
  }

  const { items } = layout;
  while (index < items.length) {
    const it = items[index]!;
    if (it.size === "hero") {
      flushSmalls();
      const next = items[index + 1];
      if (isPairableHero(it.id) && next && next.size === "hero" && isPairableHero(next.id)) {
        rows.push({ kind: "dualHero", a: it, b: next });
        index += 2;
      } else {
        rows.push({ kind: "hero", item: it });
        index += 1;
      }
    } else {
      smalls.push(it);
      index += 1;
    }
  }
  flushSmalls();
  return rows;
}
