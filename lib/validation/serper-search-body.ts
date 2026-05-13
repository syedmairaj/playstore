import { z } from "zod";
import {
  SERPER_MAX_COUNTRIES,
  SUPPORTED_COUNTRY_CODES,
} from "@/lib/countries";

export const countryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (v) => (SUPPORTED_COUNTRY_CODES as readonly string[]).includes(v),
    {
      message: `Country must be one of: ${SUPPORTED_COUNTRY_CODES.join(", ")}`,
    },
  );

export const serperSearchBodySchema = z.object({
  workspaceId: z.string().uuid(),
  keyword: z.string().trim().min(2).max(160),
  countries: z
    .array(countryCodeSchema)
    .min(1)
    .max(SERPER_MAX_COUNTRIES),
  /** Wraps the query as `site:play.google.com/store/apps "<q>"`. Used by Competitor Spy. */
  restrictToPlayStore: z.boolean().optional(),
});

export type SerperSearchBody = z.infer<typeof serperSearchBodySchema>;
