import {
  buildToneExperimentMeta,
  parseToneStyle,
  type ToneExperimentMeta,
} from "@/lib/listing/tone-ab-pairs";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

export type EnrichToneExperimentInput = {
  toneStyle: string;
  alternativeToneStyle?: string;
  output: Pick<ListingGenerationOutput, "listingVariants">;
};

/**
 * Server-side tone experiment metadata — mirrors keywordIntelligence enrichment.
 * Only attached when both listingVariants exist (A/B deploy eligible).
 */
export function enrichToneExperiment(
  input: EnrichToneExperimentInput,
): ToneExperimentMeta | null {
  const variants = input.output.listingVariants;
  if (!variants?.aggressive || !variants?.growth) return null;

  const selectedTone = parseToneStyle(input.toneStyle);
  const alternativeTone =
    input.alternativeToneStyle != null
      ? parseToneStyle(input.alternativeToneStyle, resolveAlternativeFallback(selectedTone))
      : undefined;

  return buildToneExperimentMeta(selectedTone, alternativeTone);
}

function resolveAlternativeFallback(selected: ReturnType<typeof parseToneStyle>): ReturnType<typeof parseToneStyle> {
  return buildToneExperimentMeta(selected).alternativeTone;
}
