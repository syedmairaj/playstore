import { z } from "zod";
import {
  coerceShortVariationsInput,
  shortVariationItemSchema,
  type ShortVariationItem,
} from "@/lib/listing/modular-short-variations";

export type {
  ModularShortStepData,
  ShortVariationItem,
  ShortVariationType,
} from "@/lib/listing/modular-short-variations";
export {
  SHORT_VARIATION_TYPES,
  shortDescriptionSchema,
  shortVariationText,
  zodErrorToFieldErrors,
} from "@/lib/listing/modular-short-variations";

export type ModularLongUiMode = "choice" | "manual" | "ai";

export type ModularListingDraftSnapshot = {
  modularState: ModularListingState;
  editedTitle: string;
  editedShort: string;
  editedLong: string;
  modularDraftReady: boolean;
  longUiMode: ModularLongUiMode;
};

/** Independent block ids for per-block loading / regenerate. */
export type ModularListingBlockId =
  | "title"
  | "short"
  | "hook"
  | "features"
  | "closing";

/** Keys for compare-with-previous snapshots (`short-0` … `short-2` for variations). */
export type ModularBlockSnapshotKey = ModularListingBlockId | `short-${number}`;

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
  shortDescription: { variations: ShortVariationItem[]; selectedIndex: number };
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

export type ModularLongStepData = {
  hook: string;
  features: string;
  closing: string;
};

/** UI / finalize payload — short block with selected variation index. */
export const modularListingShortStateSchema = z.object({
  variations: z
    .array(
      shortVariationItemSchema.extend({
        text: z
          .string()
          .trim()
          .min(1, { message: "shortDescription: This block is required and cannot be empty" })
          .max(80),
      }),
    )
    .length(3),
  selectedIndex: z.number().int().min(0).max(2),
});

/** Draft short — variations may be empty before short step completes. */
export const modularListingShortDraftStateSchema = z.object({
  variations: z.preprocess(
    coerceShortVariationsInput,
    z.array(shortVariationItemSchema).max(3),
  ),
  selectedIndex: z.number().int().min(0).max(2),
});
export const longDescriptionSchema = z.object({
  hook: z
    .string()
    .trim()
    .min(1, { message: "hook: This block is required and cannot be empty" })
    .max(200),
  features: z
    .string()
    .trim()
    .min(1, { message: "features: This block is required and cannot be empty" })
    .max(3200),
  closing: z
    .string()
    .trim()
    .min(1, { message: "closing: This block is required and cannot be empty" })
    .max(2400),
});

/** Lenient Gemini output — allows empty blocks during per-block regeneration. */
export const modularLongStepOutputSchema = z.object({
  hook: z.string().trim().max(200),
  features: z.string().trim().max(3200),
  closing: z.string().trim().max(2400),
});

export const modularTitleStepSchema = z.object({
  title: z.string().trim().min(1).max(30),
  lockedKeywords: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
});

/** Draft-phase long blocks — empty strings allowed while pipeline is in progress. */
export const modularListingLongDraftStateSchema = z.object({
  hook: z.string().trim().max(200),
  features: z.string().trim().max(3200),
  closing: z.string().trim().max(2400),
});

/** Finalize — all long blocks must be non-empty. */
export const modularListingLongFinalizeStateSchema = longDescriptionSchema;

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

