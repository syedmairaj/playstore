import "server-only";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  generateListingLongFeaturesWithGemini,
  generateListingLongHookClosingWithGemini,
} from "@/lib/gemini/generate-listing-modular";
import type { ModularLongStepData } from "@/lib/listing/modular-listing.types";
import { pruneContext } from "@/lib/optimizer/prune-context";
import type { ListingOptimizerInput } from "@/lib/types/listing";

const GRANULAR_LONG_MAX_ATTEMPTS = 2;

const EMPTY_LONG: ModularLongStepData = { hook: "", features: "", closing: "" };

/**
 * Granular long generation: features array (call 1) → hook/closing (call 2) → merge.
 * Returns best-effort partial output on failure — safeAssemble repairs downstream.
 */
export async function runGranularModularLongGeneration(
  input: ListingOptimizerInput,
  context: { title: string; shortDescription: string },
  lockedKeywords: string[],
): Promise<ModularLongStepData> {
  const prunedInput = pruneContext(input);
  let lastPartial = { ...EMPTY_LONG };

  for (let attempt = 0; attempt < GRANULAR_LONG_MAX_ATTEMPTS; attempt += 1) {
    const reducedComplexity = attempt > 0;
    try {
      const featuresText = await generateListingLongFeaturesWithGemini(
        prunedInput,
        context,
        lockedKeywords,
        { reducedComplexity },
      );

      const hookClosing = await generateListingLongHookClosingWithGemini(
        prunedInput,
        context,
        featuresText,
        lockedKeywords,
        { reducedComplexity },
      );

      return {
        hook: hookClosing.hook,
        features: featuresText,
        closing: hookClosing.closing,
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

  return lastPartial;
}
