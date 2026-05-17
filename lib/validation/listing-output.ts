import { z } from "zod";

export const listingGenerationCoreSchema = z.object({
  title: z.string().min(1).max(30),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),
  keywordSuggestions: z.array(z.string().min(1).max(80)).min(3).max(30),
  ctaSuggestions: z.array(z.string().min(1).max(200)).min(2).max(12),
});

export type ListingGenerationCore = z.infer<typeof listingGenerationCoreSchema>;

const coercedDim = (min: number, max: number) =>
  z.coerce
    .number()
    .transform((n) => (Number.isFinite(n) ? Math.round(n) : NaN))
    .pipe(z.number().min(min).max(max));

/** Rubric caps: title 0–30, short 0–20, long 0–40, persuasiveness 0–10 (sum 0–100). */
export const listingScoreBreakdownSchema = z.object({
  title: coercedDim(0, 30),
  shortDescription: coercedDim(0, 20),
  longDescription: coercedDim(0, 40),
  persuasiveness: coercedDim(0, 10),
});

export type ListingScoreBreakdown = z.infer<typeof listingScoreBreakdownSchema>;

const listingAsoBundleSchema = z.object({
  asoScore: z.coerce
    .number()
    .transform((n) => (Number.isFinite(n) ? Math.round(n) : NaN))
    .pipe(z.number().int().min(0).max(100)),
  scoreBreakdown: listingScoreBreakdownSchema,
  improvementTips: z.array(z.string().min(1)).min(1).max(25),
});

export type ListingAsoBundle = z.infer<typeof listingAsoBundleSchema>;

/**
 * Full listing payload (Play fields + optional Certified ASO Score block).
 * ASO fields are optional for backward compatibility with stored rows.
 */
export const listingGenerationOutputSchema = listingGenerationCoreSchema.merge(
  z.object({
    asoScore: z.number().int().min(0).max(100).optional(),
    scoreBreakdown: listingScoreBreakdownSchema.optional(),
    improvementTips: z.array(z.string().min(1)).max(25).optional(),
    /** Set when the model returned unusable ASO metadata after a successful listing parse. */
    asoScoreDegraded: z.literal(true).optional(),
  }),
);

export type ListingGenerationOutput = z.infer<typeof listingGenerationOutputSchema>;

/** Hydration / DB read: tolerate legacy rows or partial ASO by falling back to core-only. */
export function parsePersistedListingOutput(
  raw: unknown,
): ListingGenerationOutput | null {
  const full = listingGenerationOutputSchema.safeParse(raw);
  if (full.success) return full.data;
  const core = listingGenerationCoreSchema.safeParse(raw);
  return core.success ? { ...core.data } : null;
}

function sumBreakdown(b: ListingScoreBreakdown): number {
  return (
    b.title +
    b.shortDescription +
    b.longDescription +
    b.persuasiveness
  );
}

/**
 * Validates optional ASO bundle: presence rules, per-dimension caps, and sum vs total score (±2).
 */
export function tryParseListingAsoBundle(
  input: Record<string, unknown>,
): { ok: true; value: ListingAsoBundle } | { ok: false } {
  const tipsRaw = input.improvementTips;
  const tips = Array.isArray(tipsRaw)
    ? tipsRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : undefined;

  const candidate = {
    asoScore: input.asoScore,
    scoreBreakdown: input.scoreBreakdown,
    improvementTips: tips,
  };

  const parsed = listingAsoBundleSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false };

  const sum = sumBreakdown(parsed.data.scoreBreakdown);
  if (Math.abs(sum - parsed.data.asoScore) > 2) return { ok: false };

  return { ok: true, value: parsed.data };
}
