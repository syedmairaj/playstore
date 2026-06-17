import type { OptimizationQueueItem } from "@/lib/optimization-queue";

export type GenerationSuggestedAction = "AUTO_STAGE";

export type GenerationReadinessResult = {
  isReady: boolean;
  reason: string | null;
  suggestedAction: GenerationSuggestedAction | null;
};

/** Stable reason codes — map to i18n in the UI layer (EN/AR). */
export const GENERATION_READINESS_REASON = {
  EMPTY_QUEUE: "EMPTY_QUEUE",
} as const;

export type GenerationReadinessReason =
  (typeof GENERATION_READINESS_REASON)[keyof typeof GENERATION_READINESS_REASON];

/**
 * Pre-flight validation before spending listing generation credits.
 * Keeps generation services free of UI/modal concerns.
 */
export function validateGenerationReadiness(
  queue: OptimizationQueueItem[],
): GenerationReadinessResult {
  if (!Array.isArray(queue) || queue.length === 0) {
    return {
      isReady: false,
      reason: GENERATION_READINESS_REASON.EMPTY_QUEUE,
      suggestedAction: "AUTO_STAGE",
    };
  }

  return {
    isReady: true,
    reason: null,
    suggestedAction: null,
  };
}
