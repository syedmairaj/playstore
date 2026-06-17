import "server-only";
import { SchemaType } from "@/lib/ai/schema-types";
import { clampListingGenerationParsed } from "@/lib/gemini/clamp-listing-generation-parsed";
import type { ClampListingResult } from "@/lib/gemini/clamp-listing-generation-parsed";
import { getGenerativeModel } from "@/lib/ai/modelGateway";
import { checkFinishReason, extractText, isBlockedFinishReason } from "@/lib/ai/extract-model-text";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import {
  normalizeListingGenerationParsed,
  rawListingHadAsoScoreKeys,
} from "@/lib/gemini/normalize-listing-generation-parsed";
import {
  buildListingOptimizerMessages,
} from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  parseGeminiJsonText,
} from "@/lib/gemini/parse-gemini-json-response";
import {
  listingGenerationCoreSchema,
  listingGenerationOutputSchema,
  tryParseListingAsoBundle,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

/** Headroom for full listing JSON (core + v11 variants + Arabic copy). */
const LISTING_MAX_OUTPUT_TOKENS = 32_768;
/** Second attempt after MAX_TOKENS — maximum practical ceiling for gemini-2.5-flash. */
const LISTING_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS = 65_536;

type ListingVariantFields = {
  title: string;
  shortDescription: string;
  fullDescription: string;
  whatsNew?: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

function parseStrategicRationale(
  raw: unknown,
): ListingGenerationOutput["strategicRationale"] | null {
  const o = asRecord(raw);
  if (!o) return null;
  const strategicIntent =
    typeof o.strategicIntent === "string" ? o.strategicIntent.trim() : "";
  const exploitationResolutionSummary =
    typeof o.exploitationResolutionSummary === "string"
      ? o.exploitationResolutionSummary.trim()
      : "";
  const roiPrediction =
    typeof o.roiPrediction === "string" ? o.roiPrediction.trim() : "";
  if (!strategicIntent || !exploitationResolutionSummary || !roiPrediction) {
    return null;
  }
  return {
    strategicIntent: strategicIntent.slice(0, 500),
    exploitationResolutionSummary: exploitationResolutionSummary.slice(0, 800),
    roiPrediction: roiPrediction.slice(0, 500),
  };
}

function parseVariantSlice(raw: unknown): ListingVariantFields | null {
  const o = asRecord(raw);
  if (!o) return null;
  const title = typeof o.title === "string" ? o.title.trim() : "";
  const shortDescription =
    typeof o.shortDescription === "string" ? o.shortDescription.trim() : "";
  const fullDescription =
    typeof o.fullDescription === "string" ? o.fullDescription.trim() : "";
  if (!title || !shortDescription || !fullDescription) return null;
  const whatsNew =
    typeof o.whatsNew === "string" && o.whatsNew.trim()
      ? o.whatsNew.trim().slice(0, 500)
      : undefined;
  return { title, shortDescription, fullDescription, ...(whatsNew ? { whatsNew } : {}) };
}

function parseListingVariants(
  raw: unknown,
): ListingGenerationOutput["listingVariants"] | null {
  const o = asRecord(raw);
  if (!o) return null;
  const aggressive = parseVariantSlice(o.aggressive);
  const growth = parseVariantSlice(o.growth);
  if (!aggressive || !growth) return null;
  return { aggressive, growth };
}

// ── Structured-output schema ──────────────────────────────────────────────────
// All keys are camelCase — matching the system prompt exactly (v5) so Gemini
// never sees a contradiction between responseSchema and the text instructions.
const LISTING_RESPONSE_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    title: { type: SchemaType.STRING },
    shortDescription: { type: SchemaType.STRING },
    fullDescription: { type: SchemaType.STRING },
    keywordSuggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    ctaSuggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    asoScore: { type: SchemaType.INTEGER },
    scoreBreakdown: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.INTEGER },
        shortDescription: { type: SchemaType.INTEGER },
        // "longDescription" is the scoring-dimension name (0–40 pts),
        // NOT a field alias. The top-level description field is "fullDescription".
        longDescription: { type: SchemaType.INTEGER },
        persuasiveness: { type: SchemaType.INTEGER },
      },
      required: ["title", "shortDescription", "longDescription", "persuasiveness"],
    },
    improvementTips: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    // ── v8 fields ─────────────────────────────────────────────────────────
    whatsNew: { type: SchemaType.STRING },
    screenshotCaptions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    abTestVariant: {
      type: SchemaType.OBJECT,
      properties: {
        titleB: { type: SchemaType.STRING },
        hypothesis: { type: SchemaType.STRING },
      },
      required: ["titleB", "hypothesis"],
    },
    // ── v11 fields ────────────────────────────────────────────────────────
    // strategySummary: consultant-grade one-sentence synthesis note,
    // replaces strategicNote (kept for backward compat with stored rows).
    strategicNote: { type: SchemaType.STRING },
    strategySummary: { type: SchemaType.STRING },
    // ctaSuggestion: single hero CTA (≤120 chars) — the best install call-to-action
    ctaSuggestion: { type: SchemaType.STRING },
    strategicRationale: {
      type: SchemaType.OBJECT,
      properties: {
        strategicIntent: { type: SchemaType.STRING },
        exploitationResolutionSummary: { type: SchemaType.STRING },
        roiPrediction: { type: SchemaType.STRING },
      },
      required: ["strategicIntent", "exploitationResolutionSummary", "roiPrediction"],
    },
    listingVariants: {
      type: SchemaType.OBJECT,
      properties: {
        aggressive: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            shortDescription: { type: SchemaType.STRING },
            fullDescription: { type: SchemaType.STRING },
            whatsNew: { type: SchemaType.STRING },
          },
          required: ["title", "shortDescription", "fullDescription"],
        },
        growth: {
          type: SchemaType.OBJECT,
          properties: {
            title: { type: SchemaType.STRING },
            shortDescription: { type: SchemaType.STRING },
            fullDescription: { type: SchemaType.STRING },
            whatsNew: { type: SchemaType.STRING },
          },
          required: ["title", "shortDescription", "fullDescription"],
        },
      },
      required: ["aggressive", "growth"],
    },
  },
  required: [
    "title",
    "shortDescription",
    "fullDescription",
    "keywordSuggestions",
    "ctaSuggestions",
    "ctaSuggestion",
    "asoScore",
    "scoreBreakdown",
    "improvementTips",
    "whatsNew",
    "screenshotCaptions",
    "abTestVariant",
    "strategicNote",
    "strategySummary",
  ],
};

// ── Server-side retry instruction ─────────────────────────────────────────────
// Appended to the user message on the single automatic server-side retry.
// Kept English-only (model instruction, not UI copy).
const STRICT_RETRY_ADDENDUM =
  "STRICT RETRY — previous attempt failed schema validation. You MUST return every required key: " +
  "title (≤30 chars — ends on complete word, never mid-word), " +
  "shortDescription (≤80 chars — SELF-CONTAINED: every sentence that opens must close within the limit, no trailing fragments), " +
  "fullDescription (≤4000 chars), " +
  "keywordSuggestions (exactly 20 strings, each prefixed [competitive], [intent], or [gap]), " +
  "ctaSuggestions (4–8 strings — first item MUST start with 'WHY THIS RANKS: '), " +
  "ctaSuggestion (≤120 chars — single strongest hero install CTA referencing primary transformation), " +
  "asoScore (integer 0–100 = exact sum of scoreBreakdown), " +
  "scoreBreakdown.title (0–30) + shortDescription (0–20) + longDescription (0–40) + persuasiveness (0–10), " +
  "improvementTips (2–8 strings), " +
  "whatsNew (≤500 chars — opens with review issue fix if present, specific to this app), " +
  "screenshotCaptions (exactly 5 strings each ≤80 chars — conversion-priority overlay headlines), " +
  "abTestVariant (object with titleB ≤30 chars + hypothesis ≤300 chars), " +
  "strategicNote (≤400 chars — one sentence: signals used), " +
  "strategySummary (≤400 chars — one consultant-grade sentence: Fixed X + Captured Y + Converted Z + Applied tone). " +
  "strategicRationale (object: strategicIntent + exploitationResolutionSummary + roiPrediction). " +
  "listingVariants (object: aggressive + growth — each with title, shortDescription, fullDescription, whatsNew). " +
  "Root title/shortDescription/fullDescription/whatsNew MUST match listingVariants.growth. " +
  "Return ONLY the JSON object — no prose, no markdown.";

export type GenerateListingWithGeminiResult = {
  data: ListingGenerationOutput;
  /** True when ASO scoring was attempted but failed validation — copy is still valid. */
  asoScorePartial: boolean;
  /** True when the first attempt failed and a server-side retry succeeded. */
  retried: boolean;
  /**
   * True when the clamp layer had to trim shortDescription to fit ≤80 chars.
   * Surfaced in the Results Panel as a neutral hint so the user knows the system
   * actively managed the field length on their behalf.
   */
  shortDescriptionClamped: boolean;
};

// ── Core generation (single attempt) ─────────────────────────────────────────
type AttemptGenerationOptions = {
  isRetry: boolean;
  /** Raised token ceiling when the prior attempt hit MAX_TOKENS. */
  afterTruncation?: boolean;
};

async function attemptGeneration(
  input: ListingOptimizerInput,
  options: AttemptGenerationOptions,
): Promise<GenerateListingWithGeminiResult> {
  const { isRetry, afterTruncation = false } = options;
  const { system, user: baseUser } = buildListingOptimizerMessages(input);
  // On retry: append the strict-format addendum to the user message so the
  // model gets an explicit re-statement of every required field + constraint.
  const user = isRetry ? `${baseUser}\n\n${STRICT_RETRY_ADDENDUM}` : baseUser;

  // ✅ REFACTORED: Use centralized Vertex AI gateway (no API key needed)
  const model = getGenerativeModel();
  model.systemInstruction = system;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: LISTING_RESPONSE_SCHEMA,
      // 0.35 keeps copy creative while making structured fields (scores, arrays)
      // deterministic. High temperature (0.7) caused inflated self-scores and
      // inconsistent key counts that drove most schema-validation failures.
      temperature: isRetry ? 0.2 : 0.35,
      topP: 0.95,
      maxOutputTokens: afterTruncation
        ? LISTING_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS
        : LISTING_MAX_OUTPUT_TOKENS,
    },
  });

  const finish = checkFinishReason(result);
  const finishReason = finish.finishReason;
  const truncated = finish.truncated;

  if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
    console.log(`[listing-generate${isRetry ? "/retry" : ""}] finishReason:`, finishReason ?? "unknown");
    console.log(
      `[listing-generate${isRetry ? "/retry" : ""}] maxOutputTokens:`,
      afterTruncation ? LISTING_TRUNCATION_RETRY_MAX_OUTPUT_TOKENS : LISTING_MAX_OUTPUT_TOKENS,
    );
    console.log(
      `[listing-generate${isRetry ? "/retry" : ""}] raw preview:`,
      extractText(result).slice(0, 300) || "(empty)",
    );
  }

  if (!finish.ok && finish.blocked && isBlockedFinishReason(finishReason)) {
    throw new InvalidModelOutputError(
      `Model response blocked (finishReason: ${finishReason ?? "unknown"}). Please try again.`,
      { finishReason },
    );
  }

  if (truncated) {
    console.warn(
      `[listing-generate${isRetry ? "/retry" : ""}] Output truncated (${finishReason}) — attempting JSON recovery`,
    );
  }

  const rawText = extractText(result);
  if (!rawText.trim()) {
    throw new InvalidModelOutputError(
      truncated
        ? "Model output was truncated before any JSON was returned. Please try again."
        : "Model returned empty/unreadable response.",
      { truncated, finishReason },
    );
  }

  const jsonParse = parseGeminiJsonText<unknown>(rawText, { truncated, finishReason });
  if (!jsonParse.ok) {
    throw new InvalidModelOutputError(
      jsonParse.reason === "truncated"
        ? "Model output was truncated mid-JSON. Please try again."
        : "Model returned malformed JSON. Please try again.",
      { truncated: jsonParse.reason === "truncated", finishReason },
    );
  }

  if (jsonParse.recovered && (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1")) {
    console.warn(`[listing-generate${isRetry ? "/retry" : ""}] JSON recovered after truncation/heal`);
  }

  const parsed = jsonParse.value;

  // ── Normalize + clamp ─────────────────────────────────────────────────────
  // normalizeListingGenerationParsed handles snake_case legacy keys and the
  // longDescription→fullDescription alias. clampListingGenerationParsed enforces
  // Play Store hard limits before Zod validation so minor overruns don't fail.
  const normalized = normalizeListingGenerationParsed(parsed);
  const clampResult = clampListingGenerationParsed(normalized);
  const clamped = clampResult.value;
  const shortDescriptionClamped = clampResult.shortDescriptionClamped;

  // ── Core validation ───────────────────────────────────────────────────────
  const coreResult = listingGenerationCoreSchema.safeParse(clamped);
  if (!coreResult.success) {
    if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
      console.error(
        `[listing-generate${isRetry ? "/retry" : ""}] coreSchema failure:`,
        JSON.stringify(coreResult.error.flatten(), null, 2),
      );
    }
    throw new InvalidModelOutputError(
      "Model output failed Play Store schema validation. Please try again.",
      { zodError: coreResult.error, truncated, finishReason },
    );
  }

  // ── ASO bundle (optional) ─────────────────────────────────────────────────
  const clampedRecord =
    typeof clamped === "object" && clamped !== null && !Array.isArray(clamped)
      ? (clamped as Record<string, unknown>)
      : {};

  const asoTry = tryParseListingAsoBundle(clampedRecord);
  // Start with core fields, then layer in v8/v11 optional fields from clamped output.
  // coreResult.data only contains the 5 core fields — extended fields (whatsNew,
  // screenshotCaptions, abTestVariant, ctaSuggestion, strategySummary, strategicNote)
  // must be pulled directly from clampedRecord or they are silently lost before
  // final Zod validation.
  let data: ListingGenerationOutput = {
    ...coreResult.data,
    ...(typeof clampedRecord.whatsNew === "string" && clampedRecord.whatsNew.trim()
      ? { whatsNew: clampedRecord.whatsNew }
      : {}),
    ...(Array.isArray(clampedRecord.screenshotCaptions) && clampedRecord.screenshotCaptions.length > 0
      ? { screenshotCaptions: clampedRecord.screenshotCaptions as string[] }
      : {}),
    ...(clampedRecord.abTestVariant !== null &&
      typeof clampedRecord.abTestVariant === "object" &&
      !Array.isArray(clampedRecord.abTestVariant) &&
      typeof (clampedRecord.abTestVariant as Record<string, unknown>).titleB === "string" &&
      typeof (clampedRecord.abTestVariant as Record<string, unknown>).hypothesis === "string"
      ? { abTestVariant: clampedRecord.abTestVariant as { titleB: string; hypothesis: string } }
      : {}),
    // ── v11 fields ──────────────────────────────────────────────────────────
    ...(typeof clampedRecord.ctaSuggestion === "string" && clampedRecord.ctaSuggestion.trim()
      ? { ctaSuggestion: clampedRecord.ctaSuggestion.trim().slice(0, 120) }
      : {}),
    ...(typeof clampedRecord.strategySummary === "string" && clampedRecord.strategySummary.trim()
      ? { strategySummary: clampedRecord.strategySummary.trim().slice(0, 400) }
      : {}),
    // backward-compat: keep strategicNote if present
    ...(typeof clampedRecord.strategicNote === "string" && clampedRecord.strategicNote.trim()
      ? { strategicNote: clampedRecord.strategicNote.trim().slice(0, 400) }
      : {}),
    ...(parseStrategicRationale(clampedRecord.strategicRationale)
      ? { strategicRationale: parseStrategicRationale(clampedRecord.strategicRationale)! }
      : {}),
    ...(parseListingVariants(clampedRecord.listingVariants)
      ? { listingVariants: parseListingVariants(clampedRecord.listingVariants)! }
      : {}),
  };
  let asoScorePartial = false;

  if (asoTry.ok) {
    data = {
      ...data,
      asoScore: asoTry.value.asoScore,
      scoreBreakdown: asoTry.value.scoreBreakdown,
      improvementTips: asoTry.value.improvementTips,
    };
  } else if (rawListingHadAsoScoreKeys(parsed)) {
    asoScorePartial = true;
    data = { ...data, asoScoreDegraded: true };
  }

  // ── Final validation ──────────────────────────────────────────────────────
  const final = listingGenerationOutputSchema.safeParse(data);
  if (!final.success) {
    throw new InvalidModelOutputError(
      "Model output failed final schema validation. Please try again.",
      { zodError: final.error, truncated, finishReason },
    );
  }

  return { data: final.data, asoScorePartial, retried: isRetry, shortDescriptionClamped };
}

// ── Public entry point — with one automatic server-side retry ────────────────
/**
 * Calls Gemini to generate a full Play Store listing.
 *
 * If the first attempt fails schema validation (InvalidModelOutputError), a
 * second attempt is made automatically on the server — same HTTP request, no
 * extra credit charge, no client-visible toast. Only a persistent second failure
 * surfaces as a 422 to the client.
 *
 * This replaces the previous client-side retry in ListingOptimizer.tsx which
 * caused: (a) two credit deductions, (b) idempotency-lock conflicts, (c) stale
 * "retrying" toasts appearing alongside the success confirmation.
 */
export async function generateListingWithGemini(
  input: ListingOptimizerInput,
): Promise<GenerateListingWithGeminiResult> {
  try {
    return await attemptGeneration(input, { isRetry: false });
  } catch (firstErr) {
    if (!(firstErr instanceof InvalidModelOutputError)) {
      throw firstErr;
    }
    if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
      console.warn("[listing-generate] first attempt failed, retrying once:", firstErr.message, {
        truncated: firstErr.truncated,
        finishReason: firstErr.finishReason,
      });
    }
    return await attemptGeneration(input, {
      isRetry: true,
      afterTruncation: firstErr.truncated,
    });
  }
}
