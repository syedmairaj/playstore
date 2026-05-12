import { z } from "zod";

export const listingGenerationOutputSchema = z.object({
  title: z.string().min(1).max(50),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),
  keywordSuggestions: z.array(z.string().min(1).max(80)).min(3).max(30),
  ctaSuggestions: z.array(z.string().min(1).max(200)).min(2).max(12),
});

export type ListingGenerationOutput = z.infer<
  typeof listingGenerationOutputSchema
>;
