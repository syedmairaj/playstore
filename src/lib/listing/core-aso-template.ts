import "server-only";

import type { ListingOptimizerInput } from "@/lib/types/listing";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import {
  buildHeuristicLongBlocks,
  buildHeuristicShortVariations,
  buildHeuristicTitle,
} from "@/lib/listing/listing-generation-heuristics";
import { safeAssemble } from "@/lib/listing/listing-assembler";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import { assembleModularFullDescription } from "@/lib/listing/assemble-modular-listing";
import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";

export type CoreAsoTemplateResult = {
  listing: ListingGenerationOutput;
  /** Structured long-description blocks for populating the modular panel editors. */
  modularLong: ModularLongStepData;
};

/**
 * Instant Draft engine — deterministic Core ASO template (< 3s, no Redis, no Gemini).
 * Used when `isDraft: true` on POST /api/listings/generate.
 *
 * Returns both the flat `ListingGenerationOutput` (for legacy consumers) and the
 * structured `modularLong` blocks so the ModularListingPanel block editors are
 * pre-populated without waiting for the async pipeline.
 */
export function buildCoreAsoTemplateListing(
  input: ListingOptimizerInput,
  lockedKeywords: string[] = [],
): CoreAsoTemplateResult {
  const titleStep = buildHeuristicTitle(input, lockedKeywords);
  const shortStep = buildHeuristicShortVariations(input, titleStep.title);
  const shortLine = shortVariationText(
    shortStep.variations[shortStep.variations.length - 1] ?? shortStep.variations[0]!,
  );
  const longBlocks = buildHeuristicLongBlocks(input, {
    title: titleStep.title,
    shortDescription: shortLine,
  });
  const assembled = safeAssemble(longBlocks, {
    targetArabic: input.targetArabic ?? false,
  });

  const keywords =
    lockedKeywords.length > 0
      ? lockedKeywords
      : input.targetKeywords.slice(0, 12);

  const listing: ListingGenerationOutput = {
    title: titleStep.title,
    shortDescription: shortLine,
    // assembled.data contains the normalized { hook, features, closing } blocks.
    // assembleModularFullDescription joins them with double-newlines into the
    // Play-ready flat string — assembled has no .fullDescription property.
    fullDescription: assembleModularFullDescription(assembled.data),
    keywordSuggestions: keywords,
    ctaSuggestions: input.targetArabic
      ? ["حمّل الآن", "ابدأ مجانًا"]
      : ["Download now", "Get started free"],
    improvementTips: [
      input.targetArabic
        ? "هذه مسودة فورية — شغّل التوليد الكامل بعد تجهيز إشارات Keyword Tracker."
        : "This is an instant draft — run full generation after staging Keyword Tracker signals.",
    ],
  };

  return { listing, modularLong: assembled.data };
}
