import type { ModularListingState } from "@/lib/listing/modular-listing.types";
import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";
import {
  orderShortVariations,
  type ShortVariationItem,
} from "@/lib/listing/modular-short-variations";

/** Draft ingress limits — must match `modularListingDraftStateSchema`. */
const TITLE_MAX = 30;
const HOOK_MAX = 200;
const FEATURES_MAX = 3200;
const CLOSING_MAX = 2400;

/**
 * Clamp modular UI state to API/Zod ingress limits before POST /api/listings/generate.
 * Instant drafts often store the full long description in `hook` only (>200 chars),
 * which would otherwise fail validation with 400.
 */
export function sanitizeModularListingForApiIngress(
  state: ModularListingState,
): ModularListingState {
  const long = state.longDescription ?? { hook: "", features: "", closing: "" };

  let hook = (long.hook ?? "").trim();
  let features = (long.features ?? "").trim();
  let closing = (long.closing ?? "").trim();

  // Instant drafts often store the entire long description in `hook` only.
  // Redistribute overflow into features/closing instead of dropping it.
  if (hook.length > HOOK_MAX && !features && !closing) {
    const full = hook;
    hook = full.slice(0, HOOK_MAX).trim();
    const remainder = full.slice(HOOK_MAX).trim();
    features = remainder.slice(0, FEATURES_MAX);
    const afterFeatures = remainder.slice(FEATURES_MAX).trim();
    if (afterFeatures) {
      closing = afterFeatures.slice(0, CLOSING_MAX);
    }
  } else {
    hook = hook.slice(0, HOOK_MAX);
    features = features.slice(0, FEATURES_MAX);
    closing = closing.slice(0, CLOSING_MAX);
  }

  const variations: ShortVariationItem[] = orderShortVariations(
    (state.shortDescription?.variations ?? []).map((v) => ({
      type: v.type,
      text: normalizeShortVariationText(v.text ?? ""),
    })),
  ).slice(0, 3);

  const selectedIndex = Math.min(
    2,
    Math.max(0, state.shortDescription?.selectedIndex ?? 0),
  );

  return {
    title: {
      value: (state.title?.value ?? "").trim().slice(0, TITLE_MAX),
      locked: Boolean(state.title?.locked),
    },
    shortDescription: {
      variations,
      selectedIndex,
    },
    longDescription: {
      hook,
      features,
      closing,
    },
  };
}
