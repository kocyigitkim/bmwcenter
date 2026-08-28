import {
  ONBOARDING_STEPS,
  clampStep,
  isAlreadySetUp,
  isLastStep,
  progressAt,
  shouldShowOnboarding,
  stepAt,
  type OnboardingSignals,
} from "../onboardingState";

function signals(over: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    completedAt: null,
    hasTrips: false,
    hasDescribedVehicle: false,
    hasPairedAdapter: false,
    ...over,
  };
}

describe("shouldShowOnboarding", () => {
  it("runs on a genuinely fresh install", () => {
    expect(shouldShowOnboarding(signals())).toBe(true);
  });

  it("never runs again once it has been completed", () => {
    expect(shouldShowOnboarding(signals({ completedAt: 1 }))).toBe(false);
  });

  it("does not ambush someone upgrading with existing history", () => {
    // The flag did not exist when they installed the app; their data proves setup.
    expect(shouldShowOnboarding(signals({ hasTrips: true }))).toBe(false);
    expect(shouldShowOnboarding(signals({ hasDescribedVehicle: true }))).toBe(false);
    expect(shouldShowOnboarding(signals({ hasPairedAdapter: true }))).toBe(false);
  });

  it("treats any one signal of prior use as enough", () => {
    expect(isAlreadySetUp(signals())).toBe(false);
    expect(isAlreadySetUp(signals({ hasPairedAdapter: true }))).toBe(true);
  });
});

describe("step maths", () => {
  it("clamps a stored step that is out of range or nonsense", () => {
    expect(clampStep(-3)).toBe(0);
    expect(clampStep(99)).toBe(ONBOARDING_STEPS.length - 1);
    expect(clampStep(Number.NaN)).toBe(0);
    expect(clampStep(1.7)).toBe(1);
  });

  it("resolves an index to its step", () => {
    expect(stepAt(0)).toBe("welcome");
    expect(stepAt(99)).toBe(ONBOARDING_STEPS[ONBOARDING_STEPS.length - 1]);
  });

  it("knows the last step", () => {
    expect(isLastStep(0)).toBe(false);
    expect(isLastStep(ONBOARDING_STEPS.length - 1)).toBe(true);
    expect(isLastStep(500)).toBe(true);
  });

  it("reports progress that ends at one", () => {
    expect(progressAt(0)).toBeGreaterThan(0);
    expect(progressAt(ONBOARDING_STEPS.length - 1)).toBe(1);
  });
});
