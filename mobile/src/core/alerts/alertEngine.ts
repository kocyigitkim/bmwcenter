import { create } from "zustand";
import * as Notifications from "expo-notifications";
import i18n from "@/i18n";
import { AlertRules, hysteresisStillActive } from "./alertRule";
import { AudioAnnouncer } from "./audioAnnouncer";
import { useAppSettings, type FuelType } from "../settings/appSettings";
import type { VehicleSnapshot, DTC } from "../obd/vehicleSnapshot";
import type { ActiveAlert } from "./alertTypes";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

interface AlertEngineState {
  activeAlerts: ActiveAlert[];
  /** Chips that aren't tied to a live-snapshot rule (e.g. a daily fuel-price change) — the
   * `evaluate()` cycle doesn't touch these, so they persist until explicitly dismissed. */
  stickyAlerts: ActiveAlert[];
  lastFired: Record<string, number>;
  wasActive: Set<string>;
  newDTCFlag: boolean;

  evaluate: (snapshot: VehicleSnapshot, now?: number) => void;
  notifyNewDTCs: (codes: DTC[]) => void;
  notifyFuelPriceChanged: (fuelType: FuelType, oldPrice: number, newPrice: number, currencyCode: string) => Promise<void>;
  dismissSticky: (id: string) => void;
  flagNewDTC: () => void;
}

let permissionRequested = false;

async function ensureNotificationPermission(): Promise<void> {
  if (permissionRequested) return;
  permissionRequested = true;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") await Notifications.requestPermissionsAsync();
  } catch {
    // best-effort — a denied/unavailable permission just means the push half is silent
  }
}

function postLocalNotification(title: string, body: string) {
  ensureNotificationPermission()
    .then(() =>
      Notifications.scheduleNotificationAsync({
        content: { title, body, sound: "default" },
        trigger: null,
      })
    )
    .catch(() => undefined);
}

export const useAlertEngine = create<AlertEngineState>((set, get) => ({
  activeAlerts: [],
  stickyAlerts: [],
  lastFired: {},
  wasActive: new Set(),
  newDTCFlag: false,

  flagNewDTC: () => set({ newDTCFlag: true }),

  dismissSticky: (id) => set((s) => ({ stickyAlerts: s.stickyAlerts.filter((a) => a.id !== id) })),

  notifyFuelPriceChanged: async (fuelType, oldPrice, newPrice, currencyCode) => {
    const settings = useAppSettings.getState();
    if (!settings.enableAlerts) return;
    const fuelTypeLabel = i18n.t(`fuelType.${fuelType}`);
    const direction = newPrice > oldPrice ? i18n.t("alert.fuelPriceUp") : i18n.t("alert.fuelPriceDown");
    const format = (v: number) => {
      try {
        return new Intl.NumberFormat(i18n.language, { style: "currency", currency: currencyCode }).format(v);
      } catch {
        return `${v.toFixed(2)} ${currencyCode}`;
      }
    };
    const title = i18n.t("alert.fuelPriceChanged.title", { fuelType: fuelTypeLabel });
    const body = i18n.t("alert.fuelPriceChanged.body", { direction, oldPrice: format(oldPrice), newPrice: format(newPrice) });

    postLocalNotification(title, body);

    const id = `fuelPrice.changed.${fuelType}.${Date.now()}`;
    set((s) => ({ stickyAlerts: [{ id, title: `${title}: ${body}`, severity: "info" as const }, ...s.stickyAlerts].slice(0, 6) }));
  },

  notifyNewDTCs: (codes) => {
    const settings = useAppSettings.getState();
    if (codes.length === 0 || !settings.enableAlerts) return;
    const body = codes.map((c) => (c.summary ? `${c.code}: ${c.summary}` : c.code)).join("\n");
    const title = i18n.t("alert.newDTC.title");
    AudioAnnouncer.announce(`${title}. ${body.replace(/\n/g, ". ")}`, "critical");
    postLocalNotification(title, body);
    const { activeAlerts, lastFired, wasActive } = get();
    const next = activeAlerts.some((a) => a.id === "dtc.new")
      ? activeAlerts
      : [...activeAlerts, { id: "dtc.new", title, severity: "critical" as const }];
    set({
      activeAlerts: next,
      lastFired: { ...lastFired, "dtc.new": Date.now() },
      wasActive: new Set(wasActive).add("dtc.new"),
      newDTCFlag: false,
    });
  },

  evaluate: (snapshot, now = Date.now()) => {
    const settings = useAppSettings.getState();
    if (!settings.enableAlerts) {
      set({ activeAlerts: [] });
      return;
    }

    const profile = { tankCapacityL: settings.tankCapacityL };
    const { lastFired, wasActive, newDTCFlag } = get();
    const nextLastFired = { ...lastFired };
    const nextWasActive = new Set(wasActive);
    const next: ActiveAlert[] = [];
    let clearNewDTCFlag = false;

    for (const rule of AlertRules.builtIn) {
      // Care OverheatWatchdog owns coolant high/critical announcements once ported.
      if (settings.careOverheatWatchdog && (rule.id === "coolant.high" || rule.id === "coolant.critical")) {
        continue;
      }
      let triggered = rule.evaluate(snapshot, profile);
      if (!triggered && wasActive.has(rule.id)) {
        triggered = hysteresisStillActive(rule.id, snapshot);
      }
      if (rule.id === "dtc.new" && newDTCFlag) triggered = true;
      if (!triggered) continue;

      const last = nextLastFired[rule.id];
      if (last != null && now - last < rule.cooldownS * 1000) {
        if (wasActive.has(rule.id)) {
          next.push({ id: rule.id, title: i18n.t(rule.titleKey), severity: rule.severity });
        }
        continue;
      }

      const title = i18n.t(rule.titleKey);
      const body = i18n.t(rule.bodyKey);
      next.push({ id: rule.id, title, severity: rule.severity });
      nextLastFired[rule.id] = now;
      nextWasActive.add(rule.id);

      AudioAnnouncer.announce(`${title}. ${body}`, rule.severity);
      if (rule.severity === "critical") postLocalNotification(title, body);
      if (rule.id === "dtc.new") clearNewDTCFlag = true;
    }

    const nextIds = new Set(next.map((a) => a.id));
    const prunedWasActive = new Set([...nextWasActive].filter((id) => nextIds.has(id) || wasActive.has(id) === false));

    set({
      activeAlerts: next,
      lastFired: nextLastFired,
      wasActive: new Set([...prunedWasActive, ...nextIds]),
      newDTCFlag: clearNewDTCFlag ? false : get().newDTCFlag,
    });
  },
}));
