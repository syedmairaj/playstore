import { z } from "zod";
import { SERPER_MAX_COUNTRIES } from "@/lib/countries";
import { countryCodeSchema } from "@/lib/validation/serper-search-body";

const serperPreviewItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  packageId: z.string().nullable(),
  position: z.number().int().min(1).max(120),
  snippet: z.string().nullable(),
});

const serperPreviewCountryBlockSchema = z.object({
  country: countryCodeSchema,
  gl: z.string(),
  hl: z.string(),
  error: z.string().nullable(),
  items: z.array(serperPreviewItemSchema),
});

/**
 * Persist a preview the user already paid for on `POST /api/serper/play-store-search`.
 * Server recomputes rank from `results` + the workspace app's `package_name`.
 */
export const keywordSerperSaveBodySchema = z.object({
  term: z.string().trim().min(2).max(120),
  appId: z.string().uuid(),
  market: countryCodeSchema,
  results: z.array(serperPreviewCountryBlockSchema).min(1).max(SERPER_MAX_COUNTRIES),
});

export type KeywordSerperSaveBody = z.infer<typeof keywordSerperSaveBodySchema>;
