const OPTIMIZATION_QUEUE_ONBOARDING_KEY = "playstore:optimization-queue-onboarding-v1";

export function hasSeenOptimizationQueueOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(OPTIMIZATION_QUEUE_ONBOARDING_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOptimizationQueueOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OPTIMIZATION_QUEUE_ONBOARDING_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldShowOptimizationQueueOnboarding(): boolean {
  return !hasSeenOptimizationQueueOnboarding();
}
