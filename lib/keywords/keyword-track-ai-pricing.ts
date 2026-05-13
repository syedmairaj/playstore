import {
  AI_CREDIT_COSTS,
  KEYWORD_TRACK_AI_FREE_PER_GENERATION,
} from "@/lib/features/billing/credit-costs";

/**
 * Credits to debit when adding `newTermCount` new keywords tied to `listingGenerationId`,
 * given how many keywords are already tracked from that same generation.
 */
export function creditsForAiListingKeywordAdds(
  newTermCount: number,
  alreadyTrackedFromSameGeneration: number,
): number {
  if (newTermCount <= 0) return 0;
  const freeSlots = Math.max(
    0,
    KEYWORD_TRACK_AI_FREE_PER_GENERATION - alreadyTrackedFromSameGeneration,
  );
  const paidKeywords = Math.max(0, newTermCount - freeSlots);
  return paidKeywords * AI_CREDIT_COSTS.keyword_track_ai_per_keyword;
}
