import "server-only";

import { normalizeModularShortParsed } from "@/lib/gemini/normalize-modular-parsed";
import { buildHeuristicShortVariations } from "@/lib/listing/listing-generation-heuristics";
import { normalizeShortVariationText } from "@/lib/listing/modular-output-validation";
import type { ModularShortStepData } from "@/lib/listing/modular-listing.types";
import {
  SHORT_VARIATION_TYPES,
  orderShortVariations,
  type ShortVariationItem,
  type ShortVariationType,
} from "@/lib/listing/modular-short-variations";
import type { ListingOptimizerInput } from "@/lib/types/listing";

/** Collect variation rows from loose parsed shapes (object, array, partial wrapper). */
function collectVariationRows(parsed: unknown): ShortVariationItem[] {
  return normalizeModularShortParsed(parsed).variations;
}

/**
 * Inject missing growth/conversion/utility rows and dedupe duplicate types.
 * Uses grounded heuristic templates only for missing slots.
 */
export function repairModularShortVariations(
  parsed: unknown,
  input: ListingOptimizerInput,
  contextTitle: string,
): ModularShortStepData {
  const templates = buildHeuristicShortVariations(input, contextTitle);
  const templateByType = new Map(
    templates.variations.map((row) => [row.type, row] as const),
  );

  const byType = new Map<ShortVariationType, ShortVariationItem>();

  for (const row of collectVariationRows(parsed)) {
    const text = normalizeShortVariationText(row.text);
    if (!text) continue;
    if (!byType.has(row.type)) {
      byType.set(row.type, { type: row.type, text });
    }
  }

  const variations = SHORT_VARIATION_TYPES.map((type) => {
    const existing = byType.get(type);
    if (existing?.text.trim()) {
      return {
        type,
        text: normalizeShortVariationText(existing.text),
      };
    }
    const fallback = templateByType.get(type);
    return {
      type,
      text: normalizeShortVariationText(fallback?.text ?? `${contextTitle}.`),
    };
  });

  return { variations: orderShortVariations(variations) };
}
