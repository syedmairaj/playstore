import { z } from "zod";

const toneStyleSchema = z.enum([
  "professional",
  "friendly",
  "bold",
  "minimal",
]);

export const listingOptimizerAutofillBodySchema = z.object({
  workspaceId: z.string().uuid(),
  appName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  field: z.enum(["keywords", "features"]),
  /** UI language so Gemini prefers English vs Arabic when both are supported. */
  language: z.enum(["en", "ar"]).default("en"),
  /** When set, autofill updates or creates `listing_generations` for Keyword Tracker + refresh restore. */
  appId: z.string().uuid().optional(),
  toneStyle: toneStyleSchema.optional(),
  /** Current drafts used when merging one field with the LLM result (comma-separated keywords). */
  keywordsDraft: z.string().optional(),
  featuresDraft: z.string().optional(),
});

export type ListingOptimizerAutofillBody = z.infer<
  typeof listingOptimizerAutofillBodySchema
>;
