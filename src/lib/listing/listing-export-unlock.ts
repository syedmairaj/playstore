import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

/** Prompt version stamped on free instant-draft rows in `listing_generations`. */
export const INSTANT_DRAFT_PROMPT_VERSION = "instant-draft-preview-v1";

export function isListingPublicationUnlocked(params: {
  creditsLedgerId?: string | null;
  promptVersion?: string | null;
}): boolean {
  if (params.promptVersion?.trim() === INSTANT_DRAFT_PROMPT_VERSION) {
    return false;
  }
  return Boolean(params.creditsLedgerId?.trim());
}

/** Remove paid-only fields from listing output for preview / locked hydration. */
export function stripPaidListingExtras(
  output: ListingGenerationOutput,
): ListingGenerationOutput {
  const {
    asoScore: _asoScore,
    scoreBreakdown: _scoreBreakdown,
    improvementTips: _improvementTips,
    ...rest
  } = output;
  return rest;
}

export function listingOutputForPublicationState(
  output: ListingGenerationOutput,
  publicationUnlocked: boolean,
): ListingGenerationOutput {
  return publicationUnlocked ? output : stripPaidListingExtras(output);
}
