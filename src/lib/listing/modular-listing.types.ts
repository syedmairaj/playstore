import { z } from "zod";

/** Independent block ids for per-block loading / regenerate. */
export type ModularListingBlockId =
  | "title"
  | "short"
  | "hook"
  | "features"
  | "closing";

export type ModularListingGenerationStep =
  | "full"
  | "title"
  | "short"
  | "long"
  | "hook"
  | "features"
  | "closing"
  | "finalize";

export type ModularListingState = {
  title: { value: string; locked: boolean };
  shortDescription: { variations: string[]; selectedIndex: number };
  longDescription: { hook: string; features: string; closing: string };
};

export const EMPTY_MODULAR_LISTING_STATE: ModularListingState = {
  title: { value: "", locked: false },
  shortDescription: { variations: [], selectedIndex: 0 },
  longDescription: { hook: "", features: "", closing: "" },
};

export type ModularTitleStepData = {
  title: string;
  lockedKeywords: string[];
};

export type ModularShortStepData = {
  variations: [string, string, string];
};

export type ModularLongStepData = {
  hook: string;
  features: string;
  closing: string;
};

/** Gemini short-step JSON — always `{ variations: string[] }`, never a bare array. */
export const shortDescriptionSchema = z.object({
  variations: z
    .array(z.string().trim().min(1).max(80))
    .min(3)
    .max(3),
});

/** Gemini long-step JSON — hook / features / closing object wrapper. */
export const longDescriptionSchema = z.object({
  hook: z
    .string()
    .trim()
    .min(1, { message: "hook: This block is required and cannot be empty" })
    .max(1200),
  features: z
    .string()
    .trim()
    .min(1, { message: "features: This block is required and cannot be empty" })
    .max(2400),
  closing: z
    .string()
    .trim()
    .min(1, { message: "closing: This block is required and cannot be empty" })
    .max(800),
});

/** Lenient Gemini output — allows empty blocks during per-block regeneration. */
export const modularLongStepOutputSchema = z.object({
  hook: z.string().trim().max(1200),
  features: z.string().trim().max(2400),
  closing: z.string().trim().max(800),
});

export const modularTitleStepSchema = z.object({
  title: z.string().trim().min(1).max(30),
  lockedKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

/** Draft-phase long blocks — empty strings allowed while pipeline is in progress. */
export const modularListingLongDraftStateSchema = z.object({
  hook: z.string().trim().max(1200),
  features: z.string().trim().max(2400),
  closing: z.string().trim().max(800),
});

/** Finalize — all long blocks must be non-empty. */
export const modularListingLongFinalizeStateSchema = longDescriptionSchema;

/** UI / finalize payload — short block with selected variation index. */
export const modularListingShortStateSchema = z.object({
  variations: z
    .array(
      z
        .string()
        .trim()
        .min(1, { message: "shortDescription: This block is required and cannot be empty" })
        .max(80),
    )
    .min(1, { message: "shortDescription: At least one variation is required" })
    .max(3),
  selectedIndex: z.number().int().min(0).max(2),
});

/** Draft short — variations may be empty before short step completes. */
export const modularListingShortDraftStateSchema = z.object({
  variations: z.array(z.string().trim().max(80)).max(3),
  selectedIndex: z.number().int().min(0).max(2),
});

export const modularListingTitleStateSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, { message: "title: This block is required and cannot be empty" })
    .max(30),
  locked: z.boolean(),
});

/** Draft title — value may be empty before title step completes. */
export const modularListingTitleDraftStateSchema = z.object({
  value: z.string().trim().max(30),
  locked: z.boolean(),
});

/** Request body during modular draft steps (long / hook / features / closing). */
export const modularListingDraftStateSchema = z.object({
  title: modularListingTitleDraftStateSchema,
  shortDescription: modularListingShortDraftStateSchema,
  longDescription: modularListingLongDraftStateSchema,
});

/** Request body for finalize — all blocks required. */
export const modularListingFinalizeStateSchema = z.object({
  title: modularListingTitleStateSchema,
  shortDescription: modularListingShortStateSchema,
  longDescription: modularListingLongFinalizeStateSchema,
});

/** @deprecated Use modularListingFinalizeStateSchema for strict validation. */
export const modularListingLongStateSchema = modularListingLongFinalizeStateSchema;

/** @deprecated Use modularListingDraftStateSchema on API ingress; finalize schema on confirm. */
export const modularListingStateSchema = modularListingDraftStateSchema;

/** Pad short variations to exactly three entries (EN/AR) before Zod parse. */
export function padShortDescriptionVariations(
  variations: string[],
  fallback = "Discover more with this app.",
): [string, string, string] {
  const padded = [...variations];
  while (padded.length < 3) {
    padded.push(padded[padded.length - 1] ?? fallback);
  }
  return [padded[0]!, padded[1]!, padded[2]!].map((v) => v.slice(0, 80)) as [
    string,
    string,
    string,
  ];
}

/** Coerce raw Gemini JSON to `{ variations }` before schema validation. */
export function coerceShortDescriptionShape(parsed: unknown): { variations: string[] } {
  if (Array.isArray(parsed)) {
    return {
      variations: parsed
        .filter((item): item is string => typeof item === "string")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (parsed !== null && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (Array.isArray(record.variations)) {
      return {
        variations: record.variations
          .filter((item): item is string => typeof item === "string")
          .map((s) => s.trim())
          .filter(Boolean),
      };
    }
  }
  return { variations: [] };
}
