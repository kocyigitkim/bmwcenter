/**
 * Whether to run first-run setup, and how far through it we are.
 *
 * The decision is kept away from the screen because getting it wrong is
 * expensive in both directions: showing the wizard to someone with two years of
 * history is insulting, and skipping it on a fresh install leaves them on an
 * empty dashboard with no idea what to do.
 */

export const ONBOARDING_STEPS = ["welcome", "adapter", "vehicle", "odometer", "calibration"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export interface OnboardingSignals {
  completedAt: number | null;
  /** Anything that proves the app has been used before this build. */
  hasTrips: boolean;
  hasDescribedVehicle: boolean;
  hasPairedAdapter: boolean;
}

/**
 * An install that has clearly been used already is treated as set up, whatever
 * the flag says — the flag did not exist when they installed the app, and a
 * wizard is not what someone opening a familiar app is looking for.
 */
export function isAlreadySetUp(signals: OnboardingSignals): boolean {
  return signals.hasTrips || signals.hasDescribedVehicle || signals.hasPairedAdapter;
}

export function shouldShowOnboarding(signals: OnboardingSignals): boolean {
  if (signals.completedAt != null) return false;
  return !isAlreadySetUp(signals);
}

export function stepAt(index: number): OnboardingStep {
  return ONBOARDING_STEPS[clampStep(index)]!;
}

export function clampStep(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.trunc(index), 0), ONBOARDING_STEPS.length - 1);
}

export function isLastStep(index: number): boolean {
  return clampStep(index) === ONBOARDING_STEPS.length - 1;
}

/** Progress through the wizard, 0..1, for the indicator. */
export function progressAt(index: number): number {
  return (clampStep(index) + 1) / ONBOARDING_STEPS.length;
}
