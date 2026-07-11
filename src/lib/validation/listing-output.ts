import { z } from "zod";
import { orchestrationProtocolSchema } from "@/lib/listing/orchestration-protocol.schema";

const toneStyleSchema = z.enum(["professional", "friendly", "bold", "minimal"]);

export const toneExperimentArmSchema = z.object({
  tone: toneStyleSchema,
  metadataVariant: z.enum(["aggressive", "growth"]),
  label: z.string().min(1).max(64),
  trafficShare: z.literal(50),
});

export const toneExperimentSchema = z.object({
  experimentId: z.string().min(1).max(64),
  selectedTone: toneStyleSchema,
  alternativeTone: toneStyleSchema,
  armA: toneExperimentArmSchema,
  armB: toneExperimentArmSchema,
});

export type ToneExperiment = z.infer<typeof toneExperimentSchema>;

export const listingGenerationCoreSchema = z.object({
  title: z.string().min(1).max(30),
  shortDescription: z.string().min(1).max(80),
  fullDescription: z.string().min(1).max(4000),
  keywordSuggestions: z.array(z.string().min(1).max(80)).min(3).max(30),
  // ctaSuggestions[0] is a "WHY THIS RANKS:" visibility rationale (v6 prompt)
  // which can be 200–400 chars. Raise the per-item cap to 500 so it never
  // causes a schema validation failure on a fully valid generation.
  ctaSuggestions: z.array(z.string().min(1).max(500)).min(2).max(12),
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

export const keywordIntelligenceItemSchema = z.object({
  keyword: z.string().min(1).max(80),
  cluster: z.enum(["competitive", "intent", "gap"]),
  searchVolume: z.number().min(0).optional(),
  difficultyScore: z.number().min(0).max(100).optional(),
  relevanceMatch: z.number().min(0).max(100).optional(),
  roiRationale: z.string().min(1).max(300).optional(),
});

export type KeywordIntelligenceItem = z.infer<typeof keywordIntelligenceItemSchema>;

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
 * Full listing payload (Play fields + optional Certified ASO Score block + v8 fields).
 * All optional fields maintain backward compatibility with stored rows.
 */
export const listingGenerationOutputSchema = listingGenerationCoreSchema.merge(
  z.object({
    asoScore: z.number().int().min(0).max(100).optional(),
    scoreBreakdown: listingScoreBreakdownSchema.optional(),
    improvementTips: z.array(z.string().min(1)).max(25).optional(),
    /** Set when the model returned unusable ASO metadata after a successful listing parse. */
    asoScoreDegraded: z.literal(true).optional(),

    // ── v11 fields ─────────────────────────────────────────────────────────
    /**
     * Consultant-grade one-sentence synthesis summary — what signals were used and how.
     * Shown as the "Strategy Summary" card in the results panel.
     * Replaces strategicNote; both are kept for backward compatibility.
     */
    strategySummary: z.string().min(1).max(400).optional(),

    /**
     * Single strongest hero CTA (≤120 chars) — the one install call-to-action
     * that best captures the app's primary transformation. Shown prominently
     * in the results panel above the full CTA list.
     */
    ctaSuggestion: z.string().min(1).max(120).optional(),

    // ── v10 fields ─────────────────────────────────────────────────────────
    /**
     * One-sentence explanation of what signals drove the generated copy.
     * Kept for backward compatibility with stored rows; new generations use strategySummary.
     */
    strategicNote: z.string().min(1).max(400).optional(),

    // ── v8 fields ──────────────────────────────────────────────────────────
    /** "What's New" copy for Play Store release notes (≤500 chars). Indexed by Google. */
    whatsNew: z.string().min(1).max(500).optional(),
    /** Screenshot caption lines — one per slot (4–5). Tone-differentiated overlay copy. */
    screenshotCaptions: z.array(z.string().min(1).max(80)).min(3).max(6).optional(),
    /** A/B title variant for Play Store Listing Experiments. */
    abTestVariant: z
      .object({
        titleB: z.string().min(1).max(30),
        hypothesis: z.string().min(1).max(300),
      })
      .optional(),

    // ── v13 ASO Growth Strategy Mode ─────────────────────────────────────────
    strategicRationale: z
      .object({
        strategicIntent: z.string().min(1).max(500),
        exploitationResolutionSummary: z.string().min(1).max(800),
        roiPrediction: z.string().min(1).max(500),
      })
      .optional(),
    listingVariants: z
      .object({
        aggressive: z.object({
          title: z.string().min(1).max(30),
          shortDescription: z.string().min(1).max(80),
          fullDescription: z.string().min(1).max(4000),
          whatsNew: z.string().min(1).max(500).optional(),
        }),
        growth: z.object({
          title: z.string().min(1).max(30),
          shortDescription: z.string().min(1).max(80),
          fullDescription: z.string().min(1).max(4000),
          whatsNew: z.string().min(1).max(500).optional(),
        }),
      })
      .optional(),

    /** Three-phase Orchestration Protocol — discrete modules for independent UI edit/regenerate. */
    orchestration: orchestrationProtocolSchema.optional(),

    /** B2B ROI intelligence — reasoning behind keyword clusters (optional). */
    keywordIntelligence: z.array(keywordIntelligenceItemSchema).min(1).max(20).optional(),

    /** Tone-aware A/B experiment metadata — server-enriched when listingVariants exist. */
    toneExperiment: toneExperimentSchema.optional(),
  }),
);

export type ListingGenerationOutput = z.infer<typeof listingGenerationOutputSchema>;

function mergeOptionalPersistedListingFields(
  base: ListingGenerationCore,
  raw: Record<string, unknown>,
): ListingGenerationOutput {
  const merged: ListingGenerationOutput = { ...base };

  const asoBundle = tryParseListingAsoBundle(raw);
  if (asoBundle.ok) {
    merged.asoScore = asoBundle.value.asoScore;
    merged.scoreBreakdown = asoBundle.value.scoreBreakdown;
    merged.improvementTips = asoBundle.value.improvementTips;
  } else if (typeof raw.asoScore === "number" && Number.isFinite(raw.asoScore)) {
    merged.asoScore = Math.round(raw.asoScore);
  }

  if (raw.asoScoreDegraded === true) {
    merged.asoScoreDegraded = true;
  }

  for (const key of [
    "strategySummary",
    "strategicNote",
    "ctaSuggestion",
    "whatsNew",
  ] as const) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) {
      merged[key] = v.trim();
    }
  }

  if (Array.isArray(raw.screenshotCaptions)) {
    const captions = raw.screenshotCaptions.filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    if (captions.length > 0) {
      merged.screenshotCaptions = captions;
    }
  }

  if (raw.abTestVariant && typeof raw.abTestVariant === "object") {
    const ab = raw.abTestVariant as Record<string, unknown>;
    if (
      typeof ab.titleB === "string" &&
      ab.titleB.trim() &&
      typeof ab.hypothesis === "string" &&
      ab.hypothesis.trim()
    ) {
      merged.abTestVariant = {
        titleB: ab.titleB.trim(),
        hypothesis: ab.hypothesis.trim(),
      };
    }
  }

  if (raw.strategicRationale && typeof raw.strategicRationale === "object") {
    const sr = raw.strategicRationale as Record<string, unknown>;
    if (
      typeof sr.strategicIntent === "string" &&
      typeof sr.exploitationResolutionSummary === "string" &&
      typeof sr.roiPrediction === "string"
    ) {
      merged.strategicRationale = {
        strategicIntent: sr.strategicIntent,
        exploitationResolutionSummary: sr.exploitationResolutionSummary,
        roiPrediction: sr.roiPrediction,
      };
    }
  }

  if (raw.listingVariants && typeof raw.listingVariants === "object") {
    const parsedVariants = listingGenerationOutputSchema.shape.listingVariants.safeParse(
      raw.listingVariants,
    );
    if (parsedVariants.success) {
      merged.listingVariants = parsedVariants.data;
    }
  }

  const parsedOrchestration =
    listingGenerationOutputSchema.shape.orchestration.safeParse(raw.orchestration);
  if (parsedOrchestration.success) {
    merged.orchestration = parsedOrchestration.data;
  }

  const parsedKeywordIntel =
    listingGenerationOutputSchema.shape.keywordIntelligence.safeParse(
      raw.keywordIntelligence,
    );
  if (parsedKeywordIntel.success) {
    merged.keywordIntelligence = parsedKeywordIntel.data;
  }

  const parsedToneExperiment =
    listingGenerationOutputSchema.shape.toneExperiment.safeParse(raw.toneExperiment);
  if (parsedToneExperiment.success) {
    merged.toneExperiment = parsedToneExperiment.data;
  }

  return merged;
}

/** Hydration / DB read: tolerate legacy rows or partial ASO by falling back to core-only. */
export function parsePersistedListingOutput(
  raw: unknown,
): ListingGenerationOutput | null {
  const full = listingGenerationOutputSchema.safeParse(raw);
  if (full.success) return full.data;
  const core = listingGenerationCoreSchema.safeParse(raw);
  if (!core.success) return null;
  if (!raw || typeof raw !== "object") return { ...core.data };
  return mergeOptionalPersistedListingFields(core.data, raw as Record<string, unknown>);
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
