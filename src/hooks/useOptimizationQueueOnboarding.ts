"use client";

import { useCallback, useState } from "react";
import {
  markOptimizationQueueOnboardingSeen,
  shouldShowOptimizationQueueOnboarding,
} from "@/lib/client/optimization-queue-onboarding";

/**
 * One-time onboarding callout after the user successfully stages their first
 * optimization-queue signal (persisted via localStorage).
 */
export function useOptimizationQueueOnboarding() {
  const [open, setOpen] = useState(false);

  const notifyQueuedSuccess = useCallback(() => {
    if (!shouldShowOptimizationQueueOnboarding()) return;
    markOptimizationQueueOnboardingSeen();
    setOpen(true);
  }, []);

  const dismissOnboarding = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    onboardingOpen: open,
    setOnboardingOpen: setOpen,
    notifyQueuedSuccess,
    dismissOnboarding,
  };
}
