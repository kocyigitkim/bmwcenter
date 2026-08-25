import i18n from "@/i18n";

/** System × severity general guidance text — no code-specific repair steps
 * (those can't be safely verified at this scale), matching the iOS PRD constraint. */
export function guidanceText(system: string | undefined, severity: string | undefined): string {
  const systemKey = system ?? "other";
  const severityKey = severity ?? "medium";
  const key = `dtc.guidance.${systemKey}.${severityKey}`;
  const value = i18n.t(key);
  if (value !== key) return value;
  return i18n.t(`dtc.guidance.other.${severityKey}`);
}
