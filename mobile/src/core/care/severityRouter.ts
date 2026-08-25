import type { AlertSeverity } from "../alerts/alertTypes";
import type { CueSeverity, CareChannelPlan } from "./careTypes";

export function planFor(severity: CueSeverity, appInBackground = false): CareChannelPlan {
  switch (severity) {
    case "critical":
      return { speak: true, phoneChip: true, fullScreen: true, notification: true, toneCount: 2 };
    case "protective":
      return { speak: true, phoneChip: true, fullScreen: false, notification: appInBackground, toneCount: 1 };
    case "coach":
      return { speak: true, phoneChip: true, fullScreen: false, notification: false, toneCount: 0 };
    case "celebration":
      return { speak: true, phoneChip: false, fullScreen: false, notification: false, toneCount: 1 };
  }
}

export function alertSeverityFrom(cue: CueSeverity): AlertSeverity {
  switch (cue) {
    case "critical":
      return "critical";
    case "protective":
      return "warning";
    case "coach":
    case "celebration":
      return "info";
  }
}
