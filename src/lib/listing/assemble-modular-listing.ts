import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { shortVariationText } from "@/lib/listing/modular-short-variations";
import type { ListingGenerationOutput } from "@/lib/validation/listing-output";

/** Join long-description blocks into Play-ready full description (≤4000 chars). */
export function assembleModularFullDescription(
  long: ModularListingState["longDescription"],
): string {
  return [long.hook.trim(), long.features.trim(), long.closing.trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}

export function resolveModularShortDescription(
  short: ModularListingState["shortDescription"],
): string {
  const idx = Math.min(
    Math.max(0, short.selectedIndex),
    Math.max(0, short.variations.length - 1),
  );
  return shortVariationText(short.variations[idx] ?? { type: "utility", text: "" });
}

/** Map modular UI state → legacy listing copy fields. */
export function modularStateToListingCopy(state: ModularListingState): Pick<
  ListingGenerationOutput,
  "title" | "shortDescription" | "fullDescription"
> {
  return {
    title: state.title.value.trim().slice(0, 30),
    shortDescription: resolveModularShortDescription(state.shortDescription),
    fullDescription: assembleModularFullDescription(state.longDescription),
  };
}
