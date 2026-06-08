import { z } from "zod";

const serperPreviewItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  packageId: z.string().nullable(),
  position: z.number(),
  snippet: z.string().nullable(),
});

const serperPreviewCountrySchema = z.object({
  country: z.string(),
  gl: z.string(),
  hl: z.string(),
  items: z.array(serperPreviewItemSchema).max(50),
  error: z.string().nullable(),
});

/** Stored in sessionStorage + `workspace_keyword_serper_preview_drafts.payload`. */
export const keywordTrackerPreviewDraftSchema = z.object({
  v: z.literal(1),
  term: z.string().min(1).max(200),
  selectedCountries: z.array(z.string().min(2).max(4)).min(1).max(24),
  results: z.array(serperPreviewCountrySchema).min(1).max(40),
  updatedAt: z.string().min(8).max(64),
});

export type KeywordTrackerPreviewDraft = z.infer<typeof keywordTrackerPreviewDraftSchema>;
