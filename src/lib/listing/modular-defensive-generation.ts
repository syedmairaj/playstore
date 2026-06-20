import "server-only";

import { z } from "zod";
import { invokeModularShortGeneration } from "@/lib/gemini/generate-listing-modular";
import { normalizeModularShortParsed } from "@/lib/gemini/normalize-modular-parsed";
import { repairModularShortVariations } from "@/lib/listing/modular-short-repair";
import { shortDescriptionSchema } from "@/lib/listing/modular-listing.types";
import type { ModularShortStepData } from "@/lib/listing/modular-listing.types";
import type { ListingGenerationWarning } from "@/lib/listing/listing-generation-warnings";
import { ListingGenerationUnavailableError } from "@/lib/listing/listing-generation-unavailable-error";
import { buildModularShortMessages } from "@/lib/prompts/listing-modular";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import { zodErrorToFieldErrors } from "@/lib/listing/modular-short-variations";

const SELF_CORRECTION_MAX_ATTEMPTS = 1;

function formatSelfCorrectionPrompt(error: z.ZodError | undefined, parseFailed: boolean): string {
  const details = error
    ? Object.entries(zodErrorToFieldErrors(error))
        .map(([field, messages]) => `${field}: ${messages.join("; ")}`)
        .join("\n")
    : parseFailed
      ? "The response was not valid JSON or could not be parsed."
      : "The response did not match the required schema.";

  return [
    "SELF-CORRECTION REQUIRED:",
    "The previous output was malformed.",
    details,
    "Provide ONLY the valid JSON again.",
    "The `variations` array MUST contain exactly 3 items: growth, conversion, utility.",
    "Output must end with '}'. Truncate text content if needed — never truncate JSON structure.",
  ].join("\n");
}

type ShortValidationResult =
  | { ok: true; data: ModularShortStepData; repaired: boolean }
  | { ok: false; zodError?: z.ZodError; parseFailed: boolean };

function validateAndRepairShortOutput(
  parsed: unknown | null,
  input: ListingOptimizerInput,
  contextTitle: string,
): ShortValidationResult {
  if (parsed === null) {
    return { ok: false, parseFailed: true };
  }

  const normalized = normalizeModularShortParsed(parsed);
  let validated = shortDescriptionSchema.safeParse(normalized);
  if (validated.success) {
    return { ok: true, data: validated.data, repaired: false };
  }

  const repaired = repairModularShortVariations(parsed, input, contextTitle);
  validated = shortDescriptionSchema.safeParse(repaired);
  if (validated.success) {
    return { ok: true, data: validated.data, repaired: true };
  }

  return { ok: false, zodError: validated.error, parseFailed: false };
}

/**
 * Defensive short-generation pattern:
 * 1. Generate → robustParseJson → repair → Zod
 * 2. On failure: one self-correction Gemini retry (not a 400)
 * 3. Graceful failure only after repair + self-correction are exhausted
 */
export async function runDefensiveModularShortGeneration(
  input: ListingOptimizerInput,
  contextTitle: string,
  lockedKeywords: string[],
): Promise<{ data: ModularShortStepData; warnings: ListingGenerationWarning[] }> {
  const messages = buildModularShortMessages(input, contextTitle, lockedKeywords);
  const warnings: ListingGenerationWarning[] = [];

  let raw = await invokeModularShortGeneration(messages);
  let outcome = validateAndRepairShortOutput(raw.parsed, input, contextTitle);

  if (!outcome.ok) {
    for (let attempt = 0; attempt < SELF_CORRECTION_MAX_ATTEMPTS; attempt += 1) {
      const correctionSuffix = formatSelfCorrectionPrompt(
        outcome.zodError,
        outcome.parseFailed,
      );
      raw = await invokeModularShortGeneration(messages, correctionSuffix);
      outcome = validateAndRepairShortOutput(raw.parsed, input, contextTitle);
      if (outcome.ok) break;
    }
  }

  if (!outcome.ok) {
    throw new ListingGenerationUnavailableError();
  }

  if (outcome.repaired) {
    warnings.push({
      code: "short_variations_repaired",
      severity: "warning",
      message:
        "AI short-description output was incomplete or malformed. Missing variation types were repaired — review before finalize.",
    });
  }

  return { data: outcome.data, warnings };
}
