export type AlertSeverity = "info" | "warning" | "critical";
export type CueSeverity = "info" | "coach" | "celebration" | "protective" | "critical";

export interface ActiveAlert {
  id: string;
  title: string;
  severity: AlertSeverity;
}
