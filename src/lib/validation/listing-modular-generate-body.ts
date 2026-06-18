import { z } from "zod";
import { orchestrationProtocolSchema } from "@/lib/listing/orchestration-protocol.schema";
import {
  modularListingDraftStateSchema,
  modularListingFinalizeStateSchema,
} from "@/lib/listing/modular-listing.types";
import { listingGenerateBodySchema } from "@/lib/validation/listing-generate-body";

export {
  modularListingStateSchema,
  modularListingDraftStateSchema,
  modularListingFinalizeStateSchema,
  modularListingShortStateSchema,
  modularListingShortDraftStateSchema,
  modularListingLongStateSchema,
  modularListingLongDraftStateSchema,
  modularListingLongFinalizeStateSchema,
  modularListingTitleStateSchema,
  modularListingTitleDraftStateSchema,
  shortDescriptionSchema,
  longDescriptionSchema,
} from "@/lib/listing/modular-listing.types";

export const modularTitlePayloadSchema = z.object({
  value: z.string().trim().max(30).optional(),
  locked: z.boolean().optional(),
  lockedKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});

export const generationStepSchema = z.enum([
  "full",
  "title",
  "short",
  "long",
  "hook",
  "features",
  "closing",
  "finalize",
]);

const lockedKeywordItemSchema = z.string().trim().min(1).max(80);

/** Coerce request lockedKeywords — never undefined; may be empty []. */
export const lockedKeywordsRequestSchema = z
  .array(lockedKeywordItemSchema)
  .max(20)
  .default([]);

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function readStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Normalize hybrid modular request bodies before Zod parse:
 * - lockedKeywords always an array (default [])
 * - pull lockedKeywords from orchestration.modules.anchor when omitted
 * - map modularTitle → contextTitle + lockedKeywords
 */
export function normalizeModularGenerateRequest(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;

  const o = { ...(raw as Record<string, unknown>) };
  let lockedKeywords = readStringArray(o.lockedKeywords);

  const orchestration = asRecord(o.orchestration);
  const modules = orchestration ? asRecord(orchestration.modules) : null;
  const anchor = modules ? asRecord(modules.anchor) : null;
  if (lockedKeywords.length === 0 && anchor) {
    lockedKeywords = readStringArray(anchor.lockedKeywords);
  }

  const modularTitle = asRecord(o.modularTitle);
  if (modularTitle) {
    if (typeof modularTitle.value === "string" && modularTitle.value.trim() && !o.contextTitle) {
      o.contextTitle = modularTitle.value.trim().slice(0, 30);
    }
    if (lockedKeywords.length === 0) {
      lockedKeywords = readStringArray(modularTitle.lockedKeywords);
    }
  }

  const modularListing = asRecord(o.modularListing);
  const mlTitle = modularListing ? asRecord(modularListing.title) : null;
  if (mlTitle && typeof mlTitle.value === "string" && mlTitle.value.trim() && !o.contextTitle) {
    o.contextTitle = mlTitle.value.trim().slice(0, 30);
  }

  o.lockedKeywords = lockedKeywords;
  return o;
}

const listingModularGenerateBodyBase = listingGenerateBodySchema.extend({
  generationStep: generationStepSchema.optional().default("full"),
  /** Hybrid anchor keywords from UI — empty array allowed; server falls back to targetKeywords. */
  lockedKeywords: lockedKeywordsRequestSchema,
  /** Optional orchestration snapshot from a prior full generate (regenerate / finalize context). */
  orchestration: orchestrationProtocolSchema.optional(),
  /** Optional modular title state from UI (maps to contextTitle + lockedKeywords). */
  modularTitle: modularTitlePayloadSchema.optional(),
  contextTitle: z.string().trim().min(1).max(30).optional(),
  contextShortDescription: z.string().trim().min(1).max(80).optional(),
  /** Draft ingress — empty long blocks allowed during modular pipeline steps. */
  modularListing: modularListingDraftStateSchema.optional(),
});

export const listingModularGenerateBodySchema = z
  .preprocess(normalizeModularGenerateRequest, listingModularGenerateBodyBase)
  .superRefine((data, ctx) => {
    const step = data.generationStep ?? "full";

    if (step === "finalize") {
      if (!data.modularListing) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "modularListing is required when generationStep is finalize",
          path: ["modularListing"],
        });
        return;
      }
      const finalizeCheck = modularListingFinalizeStateSchema.safeParse(data.modularListing);
      if (!finalizeCheck.success) {
        for (const issue of finalizeCheck.error.issues) {
          ctx.addIssue({
            ...issue,
            path: ["modularListing", ...issue.path],
          });
        }
      }
      return;
    }

    if (
      (step === "short" || step === "long" || step === "hook" || step === "features" || step === "closing") &&
      !data.contextTitle?.trim() &&
      !data.modularListing?.title?.value?.trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "contextTitle or modularListing.title.value is required for this generation step",
        path: ["contextTitle"],
      });
    }
  });

export type ListingModularGenerateBody = z.infer<typeof listingModularGenerateBodySchema>;

export function isModularGenerationStep(
  step: z.infer<typeof generationStepSchema>,
): boolean {
  return step !== "full" && step !== "finalize";
}

export function isCreditBilledStep(step: z.infer<typeof generationStepSchema>): boolean {
  return step === "full" || step === "finalize";
}

/** Resolve locked keywords for title step — body array, orchestration anchor, or targetKeywords. */
export function resolveRequestLockedKeywords(
  body: ListingModularGenerateBody,
): string[] {
  if (body.lockedKeywords.length > 0) return body.lockedKeywords;
  if (body.orchestration?.modules.anchor.lockedKeywords.length) {
    return body.orchestration.modules.anchor.lockedKeywords;
  }
  return body.targetKeywords;
}
