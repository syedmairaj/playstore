import { z } from "zod";

export const listingOptimizerAutofillBodySchema = z.object({
  workspaceId: z.string().uuid(),
  appName: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(120),
  field: z.enum(["keywords", "features"]),
  /** UI language so Gemini prefers English vs Arabic when both are supported. */
  language: z.enum(["en", "ar"]).default("en"),
});

export type ListingOptimizerAutofillBody = z.infer<
  typeof listingOptimizerAutofillBodySchema
>;
