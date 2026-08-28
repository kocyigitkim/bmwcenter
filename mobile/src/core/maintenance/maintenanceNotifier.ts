import { Platform } from "react-native";
import notifee, { AndroidImportance, AuthorizationStatus } from "@notifee/react-native";
import i18n from "@/i18n";
import { storage } from "../settings/appSettings";
import { useGarage } from "../vehicle/useGarage";
import { maintenanceRepository, type ScheduledMaintenanceItem } from "../storage/maintenanceRepository";
import { isActionable, type DueStatus } from "./maintenanceSchedule";

const CHANNEL_ID = "maintenance";
const NOTIFICATION_ID = "maintenance-due";
const SEEN_KEY = "maintenance.notified";

type SeenMap = Record<string, DueStatus>;

function loadSeen(): SeenMap {
  try {
    const raw = storage.getString(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function saveSeen(seen: SeenMap): void {
  try {
    storage.set(SEEN_KEY, JSON.stringify(seen));
  } catch {
    // Non-fatal: the worst case is the same reminder shown twice.
  }
}

/**
 * Items worth interrupting the user over: those that have just crossed into
 * due or overdue since the last time we told them.
 *
 * Escalation-only, so a service the user has decided to postpone stops nagging
 * after the first alert — but going from due to overdue speaks up again.
 */
export function newlyActionable(items: ScheduledMaintenanceItem[], seen: SeenMap): ScheduledMaintenanceItem[] {
  return items.filter((item) => {
    if (!item.isEnabled || !isActionable(item.due.status)) return false;
    const previous = seen[item.id];
    if (previous === item.due.status) return false;
    // due -> overdue is new news; overdue -> due only happens after a service
    // was recorded, which is not something to alert about.
    return !(previous === "overdue" && item.due.status === "due");
  });
}

/** Records what the user has been told. Items that are no longer due drop out,
 * so a serviced item alerts again next interval. */
export function nextSeen(items: ScheduledMaintenanceItem[]): SeenMap {
  const next: SeenMap = {};
  for (const item of items) {
    if (isActionable(item.due.status)) next[item.id] = item.due.status;
  }
  return next;
}

function titleOf(item: ScheduledMaintenanceItem): string {
  return item.customTitle ?? i18n.t(item.titleKey, { defaultValue: item.titleKey });
}

export const maintenanceNotifier = {
  /** Checks the schedule and alerts once for anything newly due. Safe to call
   * often — it only notifies when the state actually worsened. */
  async check(now = Date.now()): Promise<void> {
    if (Platform.OS !== "android") return;
    const settings = await notifee.getNotificationSettings();
    if (settings.authorizationStatus !== AuthorizationStatus.AUTHORIZED) return;

    const items = await maintenanceRepository.schedule(now);
    const seen = loadSeen();
    const fresh = newlyActionable(items, seen);
    saveSeen(nextSeen(items));
    if (fresh.length === 0) return;

    const t = i18n.t.bind(i18n);
    const first = fresh[0]!;
    const body =
      fresh.length === 1
        ? t(`maintenance.notification.${first.due.status}`, { title: titleOf(first) })
        : t("maintenance.notification.multiple", { title: titleOf(first), count: fresh.length - 1 });

    await notifee.createChannel({
      id: CHANNEL_ID,
      name: t("maintenance.notification.channel"),
      importance: AndroidImportance.DEFAULT,
    });

    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: t("maintenance.notification.title"),
      body,
      android: {
        channelId: CHANNEL_ID,
        smallIcon: "notification_icon",
        color: "#1C6FE0",
        autoCancel: true,
        pressAction: { id: "default", launchActivity: "default" },
      },
    });
  },

  /** Forgets what has been alerted, so the next check speaks up again. */
  reset(): void {
    try {
      storage.remove(SEEN_KEY);
    } catch {
      // Non-fatal.
    }
  },

  /**
   * Re-checks whenever the user switches vehicles. Reminders are per vehicle:
   * what the user was told about the old car says nothing about this one.
   *
   * Lives here rather than in the garage store so the dependency runs one way —
   * maintenance knows about vehicles, not the other way round.
   */
  watchGarage(): () => void {
    let previous = useGarage.getState().activeId;
    return useGarage.subscribe((state) => {
      if (state.activeId === previous) return;
      previous = state.activeId;
      this.reset();
      this.check().catch(() => undefined);
    });
  },
};
