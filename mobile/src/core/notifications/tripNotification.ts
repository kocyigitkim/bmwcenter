import { Platform } from "react-native";
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  AuthorizationStatus,
} from "@notifee/react-native";
import i18n from "@/i18n";

export interface TripNotificationData {
  startedAt: number;
  distanceText: string;
  consumptionText?: string;
  costText: string;
  /** 0..100, undefined when the vehicle doesn't report fuel level. */
  fuelLevelPct?: number;
  paused: boolean;
}

const CHANNEL_ID = "trip";
const NOTIFICATION_ID = "active-trip";

/** Only bump the notification when the visible text actually changes — Android
 * rate-limits updates, and the chronometer ticks by itself anyway. */
let lastBody: string | undefined;
let running = false;

/**
 * Ongoing trip notification, Android only. Runs as a foreground service so the
 * OBD link and GPS keep working with the screen off; the service lives exactly
 * as long as the trip does.
 *
 * Layout (chosen in design review): live chronometer in the header, one line of
 * distance · average · cost, fuel level as the progress bar, a single
 * "open app" action.
 */
export const tripNotification = {
  /** Must be called once at app start, before any trip begins. */
  registerForegroundService(): void {
    if (Platform.OS !== "android") return;
    notifee.registerForegroundService(
      () =>
        new Promise(() => {
          // Resolved never: the service stays up until stop() is called.
        })
    );
  },

  async hasPermission(): Promise<boolean> {
    const settings = await notifee.getNotificationSettings();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
  },

  /** Returns true when notifications are allowed. Also walks the user through
   * the battery-optimization exemption so Android won't kill the service. */
  async requestPermissions(): Promise<boolean> {
    const settings = await notifee.requestPermission();
    const granted = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED;
    if (granted && Platform.OS === "android") {
      try {
        if (await notifee.isBatteryOptimizationEnabled()) {
          await notifee.openBatteryOptimizationSettings();
        }
      } catch {
        // Some OEM builds have no such screen; the service still works, it is
        // just more likely to be culled under memory pressure.
      }
    }
    return granted;
  },

  async show(data: TripNotificationData): Promise<void> {
    if (Platform.OS !== "android") return;
    if (!(await this.hasPermission())) return;

    const t = i18n.t.bind(i18n);
    const parts = [data.distanceText, data.consumptionText, data.costText].filter(Boolean);
    const body = parts.join("  ·  ");
    if (running && body === lastBody) return;

    await notifee.createChannel({
      id: CHANNEL_ID,
      name: t("notification.trip.channel"),
      importance: AndroidImportance.LOW, // silent — it's a status surface, not an alert
      vibration: false,
    });

    await notifee.displayNotification({
      id: NOTIFICATION_ID,
      title: t(data.paused ? "notification.trip.paused" : "notification.trip.title"),
      body,
      android: {
        channelId: CHANNEL_ID,
        asForegroundService: true, // service type comes from the manifest override
        ongoing: true,
        onlyAlertOnce: true,
        autoCancel: false,
        category: AndroidCategory.SERVICE,
        visibility: AndroidVisibility.PUBLIC,
        smallIcon: "notification_icon",
        color: "#1C6FE0",
        colorized: false,
        showTimestamp: true,
        showChronometer: !data.paused,
        timestamp: data.startedAt,
        progress:
          data.fuelLevelPct != null
            ? { max: 100, current: Math.round(Math.min(Math.max(data.fuelLevelPct, 0), 100)) }
            : undefined,
        pressAction: { id: "default", launchActivity: "default" },
        actions: [
          {
            title: t("notification.trip.open"),
            pressAction: { id: "open-app", launchActivity: "default" },
          },
        ],
      },
    });
    running = true;
    lastBody = body;
  },

  async stop(): Promise<void> {
    if (Platform.OS !== "android" || !running) return;
    running = false;
    lastBody = undefined;
    await notifee.stopForegroundService().catch(() => undefined);
    await notifee.cancelNotification(NOTIFICATION_ID).catch(() => undefined);
  },
};
