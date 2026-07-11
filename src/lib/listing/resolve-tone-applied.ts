import { parseToneStyle } from "@/lib/listing/tone-ab-pairs";
import type { ToneExperimentMeta } from "@/lib/listing/tone-ab-pairs";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";
import type { ListingVersion } from "@/lib/listing/listing-version.types";

type GenerationOutputSlice = Pick<
  ListingGenerationOutput,
  "listingVariants" | "toneExperiment"
> & {
  toneExperiment?: ToneExperimentMeta | null;
};

/**
 * Resolves which experiment tone arm a deployed listing version represents.
 * Matches version copy to variant titles when toneExperiment metadata exists.
 */
export function resolveToneAppliedForVersion(
  version: Pick<ListingVersion, "title" | "shortDescription">,
  output: GenerationOutputSlice | null | undefined,
  fallbackToneStyle: string | null | undefined,
): string | null {
  const experiment = output?.toneExperiment;
  const variants = output?.listingVariants;

  if (experiment && variants) {
    const title = version.title?.trim();
    const short = version.shortDescription?.trim();

    const matchesArm = (
      variant: { title: string; shortDescription: string } | undefined,
    ): boolean => {
      if (!variant) return false;
      if (title && variant.title.trim() === title) return true;
      if (short && variant.shortDescription.trim() === short) return true;
      return false;
    };

    if (matchesArm(variants.aggressive)) {
      return experiment.armA.tone;
    }
    if (matchesArm(variants.growth)) {
      return experiment.armB.tone;
    }

    // Partial deploy edits — prefer experiment selected tone over generic fallback.
    return experiment.selectedTone;
  }

  if (fallbackToneStyle) {
    return parseToneStyle(fallbackToneStyle);
  }

  return null;
}
