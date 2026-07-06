import "server-only";

import { sumGeminiTokens } from "@/lib/gemini/gemini-token-usage";
import {
  generateListingLongFeaturesWithGemini,
  generateListingLongHookClosingWithGemini,
} from "@/lib/gemini/generate-listing-modular";
import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import { pruneContext } from "@/lib/optimizer/prune-context";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";

const GRANULAR_LONG_MAX_ATTEMPTS = 2;

const EMPTY_LONG: ModularLongStepData = { hook: "", features: "", closing: "" };

export type GranularModularLongGenerationResult = {
  data: ModularLongStepData;
  tokensUsed: number;
};

/**
 * Granular long generation: features array (call 1) → hook/closing (call 2) → merge.
 * Returns best-effort partial output on failure — safeAssemble repairs downstream.
 */
export async function runGranularModularLongGeneration(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  lockedKeywords: string[],
): Promise<GranularModularLongGenerationResult> {
  const prunedInput = pruneContext(input);
  let lastPartial = { ...EMPTY_LONG };
  let totalTokens = 0;

  for (let attempt = 0; attempt < GRANULAR_LONG_MAX_ATTEMPTS; attempt += 1) {
    const reducedComplexity = attempt > 0;
    try {
      const features = await generateListingLongFeaturesWithGemini(
        prunedInput,
        context,
        lockedKeywords,
        { reducedComplexity },
      );
      totalTokens += features.tokensUsed;

      const hookClosing = await generateListingLongHookClosingWithGemini(
        prunedInput,
        context,
        features.featuresText,
        lockedKeywords,
        { reducedComplexity },
      );
      totalTokens += hookClosing.tokensUsed;

      return {
        data: {
          hook: hookClosing.data.hook,
          features: features.featuresText,
          closing: hookClosing.data.closing,
        },
        tokensUsed: totalTokens,
      };
    } catch (error) {
      lastPartial = {
        hook: lastPartial.hook,
        features: lastPartial.features,
        closing: lastPartial.closing,
      };
      if (error instanceof InvalidModelOutputError) {
        if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
          console.warn("[listing-modular/long-granular] attempt failed — retrying", {
            attempt,
            issues: error.zodError?.flatten(),
          });
        }
        if (attempt < GRANULAR_LONG_MAX_ATTEMPTS - 1) continue;
      }
      console.warn("[listing-modular/long-granular] returning best-effort partial output", error);
      break;
    }
  }

  return { data: lastPartial, tokensUsed: totalTokens };
}
