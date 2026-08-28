/**
 * Vehicle health score.
 *
 * Turns the evidence the app already collects — trouble codes, protection
 * events raised by the care watchdogs, cranking voltages, emissions monitor
 * status — into a score per system, with the evidence attached.
 *
 * A category with nothing to judge on reports `unknown` rather than 100. The
 * PRD is explicit that the product must never claim more certainty than it has,
 * and "perfect health" from an empty database would be exactly that.
 */

export type HealthCategory = "engine" | "cooling" | "fuelSystem" | "emissions" | "battery" | "transmission";

export const ALL_HEALTH_CATEGORIES: HealthCategory[] = [
  "engine",
  "cooling",
  "fuelSystem",
  "emissions",
  "battery",
  "transmission",
];

export type HealthGrade = "good" | "watch" | "attention" | "unknown";

export interface HealthEvidence {
  /** i18n key under health.evidence.* */
  key: string;
  params?: Record<string, string | number>;
  /** Points deducted from the category, 0-100. */
  weight: number;
}

export interface CategoryHealth {
  category: HealthCategory;
  grade: HealthGrade;
  /** 0-100, undefined when the grade is `unknown`. */
  score?: number;
  confidence: "low" | "medium" | "high";
  evidence: HealthEvidence[];
}

export interface HealthReport {
  categories: CategoryHealth[];
  /** Mean of the categories that could be judged; undefined when none could. */
  overallScore?: number;
  overallGrade: HealthGrade;
  /** Categories with no evidence either way. */
  unknownCount: number;
}

export interface HealthInputDTC {
  code: string;
  status: "stored" | "pending" | "permanent";
}

export interface HealthInputProtectionEvent {
  /** matches protection_events.type: overheat, thermostat, battery, fuelTrim, ... */
  type: string;
  severity: string;
  t: number;
}

export interface HealthInputCrank {
  date: number;
  minVoltage: number;
}

export interface HealthInput {
  now: number;
  dtcs: HealthInputDTC[];
  protectionEvents: HealthInputProtectionEvent[];
  cranks: HealthInputCrank[];
  /** From the last emissions scan, if one has ever run. */
  readiness?: { incompleteCount: number; supportedCount: number; milOn: boolean };
  /** Whether a diagnostic scan has ever completed — drives emissions confidence. */
  hasScanned: boolean;
}

/** Only events from the recent past should still count against a score. */
const EVENT_WINDOW_MS = 90 * 24 * 3600_000;

/** Cranking below this is a battery that struggles; below the second, one that
 * is failing. Figures are for a 12 V lead-acid battery at moderate ambient. */
const CRANK_WEAK_V = 9.6;
const CRANK_BAD_V = 9.0;

/** Trouble codes whose subsystem is not implied by their numeric range. */
const COOLING_CODES = new Set([
  "P0115", "P0116", "P0117", "P0118", "P0119", // coolant temp sensor
  "P0125", "P0126", "P0128", // insufficient temp for closed loop / thermostat
  "P0217", // engine overheat
  "P0480", "P0481", "P0482", // cooling fan
]);

export function categoryForCode(code: string): HealthCategory {
  const upper = code.toUpperCase();
  if (COOLING_CODES.has(upper)) return "cooling";

  const letter = upper[0];
  // B (body) and U (network) codes are not powertrain; nothing here diagnoses
  // them, so they are counted against the electrical system rather than
  // silently inflating a powertrain score.
  if (letter === "U" || letter === "B") return "battery";
  if (letter === "C") return "transmission";

  const group = upper.slice(1, 3);
  if (group === "01" || group === "02") return "fuelSystem";
  if (group === "03") return "engine";
  if (group === "04") return "emissions";
  if (group === "07" || group === "08") return "transmission";
  return "engine";
}

function weightForDTC(status: HealthInputDTC["status"]): number {
  switch (status) {
    case "permanent":
      return 35;
    case "stored":
      return 25;
    case "pending":
      return 12;
  }
}

/**
 * The types the care watchdogs actually write to protection_events. Kept as a
 * list so a new watchdog whose events nothing scores is caught by its test
 * rather than silently ignored.
 */
export const PROTECTION_EVENT_TYPES = [
  "overheat",
  "thermostat",
  "hotShutdown",
  "lowVoltage",
  "fuelTrim",
  "coldRev",
] as const;

function categoryForEvent(type: string): HealthCategory | undefined {
  switch (type) {
    case "overheat":
    case "thermostat":
    // Shutting down hot is a cooling-system stress, not an engine fault.
    case "hotShutdown":
      return "cooling";
    case "lowVoltage":
      return "battery";
    case "fuelTrim":
      return "fuelSystem";
    // Revving a cold engine is wear the engine carries.
    case "coldRev":
      return "engine";
    default:
      return undefined;
  }
}

function gradeFor(score: number): HealthGrade {
  if (score >= 85) return "good";
  if (score >= 60) return "watch";
  return "attention";
}

export function computeHealth(input: HealthInput): HealthReport {
  const evidence = new Map<HealthCategory, HealthEvidence[]>();
  const push = (category: HealthCategory, item: HealthEvidence) => {
    const list = evidence.get(category) ?? [];
    list.push(item);
    evidence.set(category, list);
  };

  for (const dtc of input.dtcs) {
    push(categoryForCode(dtc.code), {
      key: `health.evidence.dtc.${dtc.status}`,
      params: { code: dtc.code },
      weight: weightForDTC(dtc.status),
    });
  }

  const recent = input.protectionEvents.filter((e) => input.now - e.t <= EVENT_WINDOW_MS);
  const byType = new Map<string, number>();
  for (const e of recent) byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
  for (const [type, count] of byType) {
    const category = categoryForEvent(type);
    if (!category) continue;
    push(category, {
      key: `health.evidence.event.${type}`,
      params: { count },
      // Repeat occurrences matter, but one bad day should not zero a category.
      weight: Math.min(15 + (count - 1) * 5, 30),
    });
  }

  const recentCranks = input.cranks
    .filter((c) => input.now - c.date <= EVENT_WINDOW_MS)
    .sort((a, b) => b.date - a.date)
    .slice(0, 10);
  if (recentCranks.length > 0) {
    const worst = Math.min(...recentCranks.map((c) => c.minVoltage));
    if (worst < CRANK_BAD_V) {
      push("battery", { key: "health.evidence.crankBad", params: { volts: worst.toFixed(1) }, weight: 40 });
    } else if (worst < CRANK_WEAK_V) {
      push("battery", { key: "health.evidence.crankWeak", params: { volts: worst.toFixed(1) }, weight: 20 });
    }
  }

  if (input.readiness) {
    if (input.readiness.milOn) {
      push("emissions", { key: "health.evidence.milOn", weight: 30 });
    }
    if (input.readiness.incompleteCount > 0) {
      push("emissions", {
        key: "health.evidence.monitorsIncomplete",
        params: { count: input.readiness.incompleteCount },
        weight: Math.min(input.readiness.incompleteCount * 8, 32),
      });
    }
  }

  const categories: CategoryHealth[] = ALL_HEALTH_CATEGORIES.map((category) => {
    const items = evidence.get(category) ?? [];
    const confidence = confidenceFor(category, input, items.length > 0);

    if (!hasBasisFor(category, input, items.length > 0)) {
      return { category, grade: "unknown", confidence, evidence: [] };
    }

    const score = Math.max(0, 100 - items.reduce((sum, e) => sum + e.weight, 0));
    return { category, grade: gradeFor(score), score, confidence, evidence: items };
  });

  const scored = categories.filter((c) => c.score != null);
  const overallScore = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + (c.score ?? 0), 0) / scored.length)
    : undefined;

  return {
    categories,
    overallScore,
    overallGrade: overallScore == null ? "unknown" : gradeFor(overallScore),
    unknownCount: categories.filter((c) => c.grade === "unknown").length,
  };
}

/**
 * Whether there is anything to judge this particular category on.
 *
 * Deliberately per-category: data about the battery says nothing about the
 * gearbox, so a car with only crank records must still report the transmission
 * as unknown rather than scoring it 100 by default.
 */
function hasBasisFor(category: HealthCategory, input: HealthInput, hasEvidence: boolean): boolean {
  if (hasEvidence) return true;
  // A completed scan is evidence of absence for anything a trouble code reports.
  if (input.hasScanned) return true;
  if (category === "battery") return input.cranks.length > 0;
  return false;
}

function confidenceFor(
  category: HealthCategory,
  input: HealthInput,
  hasEvidence: boolean
): CategoryHealth["confidence"] {
  if (category === "emissions") {
    if (!input.hasScanned) return "low";
    return input.readiness ? "high" : "medium";
  }
  if (category === "battery") {
    if (input.cranks.length >= 5) return "high";
    if (input.cranks.length > 0) return "medium";
    return hasEvidence ? "medium" : "low";
  }
  if (!input.hasScanned) return hasEvidence ? "medium" : "low";
  return hasEvidence ? "high" : "medium";
}
