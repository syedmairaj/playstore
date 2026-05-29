import "server-only";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { clampListingGenerationParsed } from "@/lib/gemini/clamp-listing-generation-parsed";
import {
  assertGeminiApiKey,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
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
  listingGenerationCoreSchema,
  listingGenerationOutputSchema,
  tryParseListingAsoBundle,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

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
  },
  required: ["title", "shortDescription", "fullDescription", "keywordSuggestions", "ctaSuggestions"],
};

// ── Server-side retry instruction ─────────────────────────────────────────────
// Appended to the user message on the single automatic server-side retry.
// Kept English-only (model instruction, not UI copy).
const STRICT_RETRY_ADDENDUM =
  "STRICT RETRY — previous attempt failed schema validation. You MUST return every required key: " +
  "title (≤30 chars), shortDescription (≤74 chars — count every character, never 75+), fullDescription (≤4000 chars), " +
  "keywordSuggestions (exactly 20 strings, each prefixed [competitive], [intent], or [gap]), " +
  "ctaSuggestions (4–8 strings — first item MUST start with 'WHY THIS RANKS: '), " +
  "asoScore (integer 0–100 = exact sum of scoreBreakdown), " +
  "scoreBreakdown.title (0–30) + shortDescription (0–20) + longDescription (0–40) + persuasiveness (0–10), " +
  "improvementTips (2–8 strings), " +
  "whatsNew (≤500 chars — Play Store release notes, opens with pain point resolved, keywords woven in), " +
  "screenshotCaptions (exactly 5 strings each ≤80 chars — screenshot overlay headlines ordered by conversion priority), " +
  "abTestVariant (object with titleB ≤30 chars + hypothesis ≤300 chars — A/B title test for Play Store Experiments). " +
  "Return ONLY the JSON object — no prose, no markdown.";

export type GenerateListingWithGeminiResult = {
  data: ListingGenerationOutput;
  /** True when ASO scoring was attempted but failed validation — copy is still valid. */
  asoScorePartial: boolean;
  /** True when the first attempt failed and a server-side retry succeeded. */
  retried: boolean;
};

// ── Core generation (single attempt) ─────────────────────────────────────────
async function attemptGeneration(
  input: ListingOptimizerInput,
  isRetry: boolean,
): Promise<GenerateListingWithGeminiResult> {
  const apiKey = assertGeminiApiKey();
  const modelName = resolveGeminiModel();

  const { system, user: baseUser } = buildListingOptimizerMessages(input);
  // On retry: append the strict-format addendum to the user message so the
  // model gets an explicit re-statement of every required field + constraint.
  const user = isRetry ? `${baseUser}\n\n${STRICT_RETRY_ADDENDUM}` : baseUser;

  const genAI = new GoogleGenerativeAI(apiKey);
  // generationConfig MUST be inline on generateContent, NOT on getGenerativeModel —
  // SDK ^0.21.0 strips unknown keys from the constructor before the request is built.
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });

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
      // 4096 gives comfortable headroom: ~1000 tokens for 4000-char description +
      // ~600 for remaining fields. Previous 2540 was dangerously close to real
      // output sizes and triggered the truncation-recovery guard in production.
      maxOutputTokens: 4096,
    },
  });

  // ── Finish-reason guard ───────────────────────────────────────────────────
  // response.text() throws a generic Error when finishReason is MAX_TOKENS,
  // SAFETY, etc. Inspect the candidate first so we throw InvalidModelOutputError
  // (which triggers a credit refund + 422) rather than an unclassified 500.
  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason as string | undefined;
  const isBlocked = finishReason && finishReason !== "STOP" && finishReason !== "1";

  if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
    console.log(`[listing-generate${isRetry ? "/retry" : ""}] finishReason:`, finishReason ?? "unknown");
    console.log(`[listing-generate${isRetry ? "/retry" : ""}] raw preview:`, candidate?.content?.parts?.[0]?.text?.slice(0, 300) ?? "(empty)");
  }

  if (isBlocked) {
    throw new InvalidModelOutputError(
      `Model response blocked (finishReason: ${finishReason ?? "unknown"}). Please try again.`,
    );
  }

  // ── Extract text ──────────────────────────────────────────────────────────
  let rawText: string;
  try {
    rawText = result.response.text();
  } catch (textErr) {
    throw new InvalidModelOutputError(
      `Model returned empty/unreadable response: ${textErr instanceof Error ? textErr.message : String(textErr)}`,
    );
  }

  // ── Truncation recovery ───────────────────────────────────────────────────
  // Heals the most common truncation pattern (open braces > close braces) so
  // a network-truncated response doesn't throw a hard JSON.parse error.
  let text = rawText?.trim() ?? "";
  if (text.startsWith("{") && !text.endsWith("}")) {
    text = text.replace(/,\s*$/, "");
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    text += "}".repeat(Math.max(0, opens - closes));
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidModelOutputError("Model returned malformed JSON. Please try again.");
  }

  // ── Normalize + clamp ─────────────────────────────────────────────────────
  // normalizeListingGenerationParsed handles snake_case legacy keys and the
  // longDescription→fullDescription alias. clampListingGenerationParsed enforces
  // Play Store hard limits before Zod validation so minor overruns don't fail.
  const normalized = normalizeListingGenerationParsed(parsed);
  const clamped = clampListingGenerationParsed(normalized);

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
      coreResult.error,
    );
  }

  // ── ASO bundle (optional) ─────────────────────────────────────────────────
  const clampedRecord =
    typeof clamped === "object" && clamped !== null && !Array.isArray(clamped)
      ? (clamped as Record<string, unknown>)
      : {};

  const asoTry = tryParseListingAsoBundle(clampedRecord);
  let data: ListingGenerationOutput = { ...coreResult.data };
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
      final.error,
    );
  }

  return { data: final.data, asoScorePartial, retried: isRetry };
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
    return await attemptGeneration(input, false);
  } catch (firstErr) {
    // Only retry on schema/parse failures — not on auth errors, blocked safety
    // responses, or network errors (those are permanent for this request).
    if (!(firstErr instanceof InvalidModelOutputError)) {
      throw firstErr;
    }
    if (process.env.NODE_ENV !== "production" || process.env.DEBUG_GEMINI === "1") {
      console.warn("[listing-generate] first attempt failed, retrying once:", firstErr.message);
    }
    // Second attempt: lower temperature (0.2) + strict-format addendum.
    // If this also fails, the InvalidModelOutputError propagates to the API
    // route which refunds credits and returns 422 to the client.
    return await attemptGeneration(input, true);
  }
}
