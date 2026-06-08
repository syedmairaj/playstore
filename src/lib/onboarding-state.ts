export type OnboardingState = {
  completed?: boolean;
  step?: number;
  version?: number;
};

export function isOnboardingPending(state: unknown): boolean {
  if (state == null || state === undefined) return false;
  if (typeof state !== "object" || state === null) return false;
  const o = state as OnboardingState;
  return o.completed !== true;
}
