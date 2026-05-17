import { z } from "zod";
import { SERPER_MAX_COUNTRIES } from "@/lib/countries";
import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";
import { countryCodeSchema } from "@/lib/validation/serper-search-body";

const serperPreviewItemSchema = z.object({
  title: z.string().max(500),
  link: z.string().max(2000),
  packageId: z.string().max(256).nullable(),
  position: z.preprocess(
    (v) => {
      if (typeof v === "string") {
        const n = Number.parseInt(v.trim(), 10);
        return Number.isFinite(n) ? n : v;
      }
      return v;
    },
    z.number().int().min(1).max(200),
  ),
  snippet: z.string().max(2000).nullable(),
});

const serperPreviewCountryBlockSchema = z.object({
  country: countryCodeSchema,
  gl: z.string().max(8),
  hl: z.string().max(16),
  error: z.string().max(2000).nullable(),
  /** Organic Play results; capped to bound request size (Serper uses num≈20). */
  items: z.array(serperPreviewItemSchema).max(40),
});

/** Shared by serper-save and POST create-keyword (`initialRanks`). */
export const snapshotRankEntrySchema = z.object({
  country: countryCodeSchema,
  rank: z.union([
    z.number().int().min(1).max(200),
    z.literal(SERPER_RANK_NOT_IN_FIRST_PAGE),
  ]),
});

/**
 * Persist ranks from a Serper preview (`POST /api/serper/play-store-search` — credits charged there).
 * No AI debit on this route. Server recomputes rank from `results` + the workspace app's `package_name`.
 * `countries[0]` is the primary market stored on `keywords.market` unless optional
 * `primaryCountry` is sent (must be one of `countries`); one snapshot per listed country.
 * Optional `keywordId`: must belong to the workspace + `appId` and match `term` (add-then-save flow).
 *
 * Optional `snapshotRanks`: per-country ranks computed from the same preview + package as the client
 * (mirrors the UI); when present, the server persists these integers so stored ranks match the preview.
 */
export const keywordSerperSaveBodySchema = z
  .object({
    term: z.string().trim().min(2).max(120),
    appId: z.string().uuid(),
    keywordId: z.string().uuid().optional(),
    /** When set, moved to the front of `countries` so it becomes `keywords.market` + primary rank. */
    primaryCountry: countryCodeSchema.optional(),
    countries: z.array(countryCodeSchema).min(1).max(SERPER_MAX_COUNTRIES),
    results: z.array(serperPreviewCountryBlockSchema).min(1).max(SERPER_MAX_COUNTRIES),
    snapshotRanks: z.array(snapshotRankEntrySchema).max(SERPER_MAX_COUNTRIES).optional(),
  })
  .superRefine((val, ctx) => {
    const previewMarkets = new Set(
      val.results.map((b) => String(b.country ?? "").trim().toLowerCase()),
    );
    for (let i = 0; i < val.countries.length; i++) {
      const c = String(val.countries[i] ?? "")
        .trim()
        .toLowerCase();
      if (!previewMarkets.has(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each country must have a matching block in preview results.",
          path: ["countries", i],
        });
      }
    }

    if (!val.snapshotRanks?.length) return;

    const want = new Set(val.countries.map((c) => String(c).trim().toLowerCase()));
    const seen = new Set<string>();
    for (let i = 0; i < val.snapshotRanks.length; i++) {
      const c = String(val.snapshotRanks[i]?.country ?? "")
        .trim()
        .toLowerCase();
      if (!want.has(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "snapshotRanks country must appear in countries.",
          path: ["snapshotRanks", i, "country"],
        });
      }
      if (seen.has(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Duplicate snapshotRanks country.",
          path: ["snapshotRanks", i, "country"],
        });
      }
      seen.add(c);
    }
    for (const c of want) {
      if (!seen.has(c)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "snapshotRanks must include every country when provided.",
          path: ["snapshotRanks"],
        });
        break;
      }
    }
  });

export type KeywordSerperSaveBody = z.infer<typeof keywordSerperSaveBodySchema>;
