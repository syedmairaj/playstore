import "server-only";

import { AI_CREDIT_COSTS } from "@/lib/features/billing/credit-costs";
import {
  logGenerationCost,
  type ListingGenerationCostPhase,
} from "@/lib/db/listing-generation-costs";

/** Safety valve — warn when a single phase exceeds this token budget. */
export const LISTING_PHASE_TOKEN_THRESHOLD = 200_000;

export function warnIfPhaseTokenThresholdExceeded(params: {
  phase: ListingGenerationCostPhase;
  tokensUsed: number;
  workspaceId: string;
  queueHash: string;
  threshold?: number;
}): void {
  const threshold = params.threshold ?? LISTING_PHASE_TOKEN_THRESHOLD;
  if (params.tokensUsed <= threshold) return;

  const err = new Error("Listing phase token threshold exceeded");
  console.warn(
    JSON.stringify({
      event: "listing_phase_token_threshold_exceeded",
      workspaceId: params.workspaceId,
      queueHash: params.queueHash,
      phase: params.phase,
      tokensUsed: params.tokensUsed,
      threshold,
      stack: err.stack,
    }),
  );
}

export function resolveListingPhaseCreditCost(params: {
  phase: ListingGenerationCostPhase;
  isRegenerate?: boolean;
  billedFullListing?: boolean;
}): number {
  if (params.isRegenerate && params.phase !== "full") {
    return 1;
  }
  if (params.billedFullListing && (params.phase === "full" || params.phase === "long")) {
    return AI_CREDIT_COSTS.listing_generation;
  }
  if (params.phase === "full") {
    return AI_CREDIT_COSTS.listing_generation;
  }
  return 0;
}

export async function recordGenerationPhaseCost(params: {
  workspaceId: string;
  queueHash: string;
  phase: ListingGenerationCostPhase;
  tokensUsed: number;
  creditCost?: number;
  isRegenerate?: boolean;
  billedFullListing?: boolean;
}): Promise<void> {
  const tokensUsed = Math.max(0, Math.floor(params.tokensUsed));
  if (tokensUsed === 0) return;

  warnIfPhaseTokenThresholdExceeded({
    phase: params.phase,
    tokensUsed,
    workspaceId: params.workspaceId,
    queueHash: params.queueHash,
  });

  const creditCost =
    params.creditCost ??
    resolveListingPhaseCreditCost({
      phase: params.phase,
      isRegenerate: params.isRegenerate,
      billedFullListing: params.billedFullListing,
    });

  console.log(
    JSON.stringify({
      event: "listing_phase_cost_recorded",
      workspaceId: params.workspaceId,
      queueHash: params.queueHash,
      phase: params.phase,
      tokensUsed,
      creditCost,
    }),
  );

  await logGenerationCost({
    workspaceId: params.workspaceId,
    queueHash: params.queueHash,
    phase: params.phase,
    tokensUsed,
    creditCost,
  });
}
