/**
 * Turning a caught render error into something a person can act on.
 *
 * Kept apart from the boundary component so the formatting can be tested, and
 * because the hard part is not catching the error — it is producing a report
 * that is useful to whoever reads it without leaking anything the user would
 * not want to paste into a message.
 */

export interface CrashContext {
  screen?: string;
  appVersion?: string;
  platform?: string;
  at: number;
}

export interface CrashReport {
  message: string;
  stack?: string;
  componentStack?: string;
  context: CrashContext;
}

/** Stack traces get long; a report nobody can paste is a report nobody sends. */
const MAX_STACK_LINES = 12;
const MAX_COMPONENT_STACK_LINES = 8;

export function describeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || error.name || "Error", stack: error.stack };
  }
  if (typeof error === "string") return { message: error };
  // A thrown object with no message is still worth naming rather than showing
  // the empty string a bare String() would give.
  try {
    return { message: JSON.stringify(error) ?? "Unknown error" };
  } catch {
    return { message: "Unknown error" };
  }
}

function trim(stack: string | undefined, maxLines: number): string | undefined {
  if (!stack) return undefined;
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= maxLines) return lines.join("\n");
  return [...lines.slice(0, maxLines), `… ${lines.length - maxLines} more`].join("\n");
}

export function buildCrashReport(
  error: unknown,
  componentStack: string | undefined,
  context: CrashContext
): CrashReport {
  const described = describeError(error);
  return {
    message: described.message,
    stack: trim(described.stack, MAX_STACK_LINES),
    componentStack: trim(componentStack, MAX_COMPONENT_STACK_LINES),
    context,
  };
}

/**
 * The report as text to put on the clipboard.
 *
 * Deliberately carries no trip, location or vehicle data — a crash report
 * should be safe to paste into a message without a second thought.
 */
export function formatCrashReport(report: CrashReport): string {
  const lines = [
    `QuickCar crash report`,
    `when: ${new Date(report.context.at).toISOString()}`,
  ];
  if (report.context.screen) lines.push(`screen: ${report.context.screen}`);
  if (report.context.appVersion) lines.push(`version: ${report.context.appVersion}`);
  if (report.context.platform) lines.push(`platform: ${report.context.platform}`);
  lines.push("", `error: ${report.message}`);
  if (report.stack) lines.push("", "stack:", report.stack);
  if (report.componentStack) lines.push("", "components:", report.componentStack);
  return lines.join("\n");
}
