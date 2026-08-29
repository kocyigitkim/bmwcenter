/**
 * Which design sits in which widget slot, and the user's own designs.
 *
 * Android gives no way to ask the user which design they want as they drop a
 * widget on the home screen without a native configuration activity, so the app
 * offers three slots instead. Each is a separate widget in the launcher's
 * picker, and each is assigned a design here — which means up to three
 * different QuickCar widgets can sit on the home screen at once.
 */

import { create } from "zustand";
import { storage } from "../settings/appSettings";
import { normaliseDesign, type WidgetDesign } from "./widgetDesign";
import { defaultDesign, presetById, WIDGET_PRESETS } from "./widgetPresets";

export const WIDGET_SLOTS = ["a", "b", "c"] as const;
export type WidgetSlot = (typeof WIDGET_SLOTS)[number];

const SLOT_KEY = "widget.slots";
const CUSTOM_KEY = "widget.customDesigns";

type SlotAssignment = Record<WidgetSlot, string>;

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = storage.getString(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    // Losing a preference is not worth an error the user cannot act on.
  }
}

function loadCustomDesigns(): WidgetDesign[] {
  const raw = readJSON<unknown[]>(CUSTOM_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Partial<WidgetDesign> & { id: string } =>
      typeof d === "object" && d !== null && typeof (d as { id?: unknown }).id === "string"
    )
    .map((d) => normaliseDesign(d));
}

function loadSlots(): SlotAssignment {
  const stored = readJSON<Partial<SlotAssignment>>(SLOT_KEY, {});
  const out = {} as SlotAssignment;
  for (const slot of WIDGET_SLOTS) {
    out[slot] = typeof stored[slot] === "string" ? stored[slot]! : defaultDesign().id;
  }
  return out;
}

interface WidgetSlotState {
  slots: SlotAssignment;
  customDesigns: WidgetDesign[];

  assign: (slot: WidgetSlot, designId: string) => void;
  saveCustom: (design: WidgetDesign) => void;
  deleteCustom: (designId: string) => void;
  /** Every design the user can pick from, presets first. */
  allDesigns: () => WidgetDesign[];
  designFor: (slot: WidgetSlot) => WidgetDesign;
}

export const useWidgetSlots = create<WidgetSlotState>((set, get) => ({
  slots: loadSlots(),
  customDesigns: loadCustomDesigns(),

  assign: (slot, designId) => {
    const slots = { ...get().slots, [slot]: designId };
    writeJSON(SLOT_KEY, slots);
    set({ slots });
  },

  saveCustom: (design) => {
    const normalised = normaliseDesign(design);
    const existing = get().customDesigns;
    const index = existing.findIndex((d) => d.id === normalised.id);
    const customDesigns =
      index >= 0
        ? existing.map((d, i) => (i === index ? normalised : d))
        : [...existing, normalised];
    writeJSON(CUSTOM_KEY, customDesigns);
    set({ customDesigns });
  },

  deleteCustom: (designId) => {
    const customDesigns = get().customDesigns.filter((d) => d.id !== designId);
    writeJSON(CUSTOM_KEY, customDesigns);

    // A slot pointing at a design that no longer exists would render nothing,
    // so any slot using it falls back to the default.
    const slots = { ...get().slots };
    let changed = false;
    for (const slot of WIDGET_SLOTS) {
      if (slots[slot] === designId) {
        slots[slot] = defaultDesign().id;
        changed = true;
      }
    }
    if (changed) writeJSON(SLOT_KEY, slots);
    set({ customDesigns, slots });
  },

  allDesigns: () => [...WIDGET_PRESETS, ...get().customDesigns],

  designFor: (slot) => {
    const id = get().slots[slot];
    return get().customDesigns.find((d) => d.id === id) ?? presetById(id) ?? defaultDesign();
  },
}));

/** A fresh id for a design the user is about to create. */
export function newCustomDesignId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
