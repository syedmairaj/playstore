import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { EMPTY_MODULAR_LISTING_STATE } from "@/lib/listing/modular-listing.types";
import { shortVariationText, type ShortVariationItem } from "@/lib/listing/modular-short-variations";
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

/** Map flat listing copy (+ optional long blocks) → modular panel state. */
export function listingCopyToModularState(
  copy: {
    title?: string;
    shortDescription?: string;
    fullDescription?: string;
  },
  options?: {
    modularLong?: ModularListingState["longDescription"];
    /** When set, populates Phase 2 with distinct growth / conversion / utility lines. */
    shortVariations?: ShortVariationItem[];
    base?: ModularListingState;
  },
): ModularListingState {
  const base = options?.base ?? EMPTY_MODULAR_LISTING_STATE;
  const title = (copy.title ?? "").trim().slice(0, 30);
  const short = (copy.shortDescription ?? "").trim();
  const longFromBlocks = options?.modularLong;
  const longDescription =
    longFromBlocks ??
    (copy.fullDescription?.trim()
      ? { hook: copy.fullDescription.trim(), features: "", closing: "" }
      : base.longDescription);

  const shortVariations =
    options?.shortVariations?.filter((v) => v.text.trim()).slice(0, 3) ?? [];

  return {
    title: { value: title, locked: Boolean(title) },
    shortDescription:
      shortVariations.length >= 3
        ? {
            variations: shortVariations,
            selectedIndex: 2,
          }
        : short
          ? {
              variations: [
                { type: "growth", text: short },
                { type: "conversion", text: short },
                { type: "utility", text: short },
              ],
              selectedIndex: 2,
            }
          : base.shortDescription,
    longDescription,
  };
}

/** Prefer persisted modular state; fall back to edited copy props when a phase is empty. */
export function mergeModularDisplayState(
  state: ModularListingState,
  props: {
    title?: string;
    shortDescription?: string;
    longDescription?: string;
  },
): ModularListingState {
  const hasShort = state.shortDescription.variations.some((v) => v.text.trim());
  const hasLong = Boolean(assembleModularFullDescription(state.longDescription).trim());
  const titleValue = (state.title.value.trim() || props.title?.trim() || "").slice(0, 30);

  // Keep all three short variations and the user's selectedIndex — collapsing to
  // resolveModularShortDescription() would duplicate one line and reset index to 2.
  if (hasShort) {
    return {
      title: {
        value: titleValue,
        locked: state.title.locked || Boolean(titleValue),
      },
      shortDescription: state.shortDescription,
      longDescription: hasLong
        ? state.longDescription
        : props.longDescription?.trim()
          ? { hook: props.longDescription.trim(), features: "", closing: "" }
          : state.longDescription,
    };
  }

  return listingCopyToModularState(
    {
      title: titleValue || props.title,
      shortDescription: props.shortDescription,
      fullDescription: hasLong
        ? assembleModularFullDescription(state.longDescription)
        : props.longDescription,
    },
    {
      modularLong: hasLong ? state.longDescription : undefined,
      base: state,
    },
  );
}
