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
import { buildListingOptimizerMessages } from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  listingGenerationCoreSchema,
  listingGenerationOutputSchema,
  tryParseListingAsoBundle,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

// ── Structured-output schema ─────────────────────────────────────────────────
// Mirrors listingGenerationOutputSchema + the optional ASO bundle.
// Using responseSchema forces Gemini to emit valid JSON matching this shape,
// eliminating "Model returned invalid JSON" transient failures entirely.
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
        longDescription: { type: SchemaType.INTEGER },
        persuasiveness: { type: SchemaType.INTEGER },
      },
      required: ["title", "shortDescription", "longDescription", "persuasiveness"],
    },
    improvementTips: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  },
  required: ["title", "shortDescription", "fullDescription", "keywordSuggestions", "ctaSuggestions"],
};

export type GenerateListingWithGeminiResult = {
  data: ListingGenerationOutput;
  /** Model attempted ASO scoring but output failed validation; listing copy is still valid. */
  asoScorePartial: boolean;
};

export async function generateListingWithGemini(
  input: ListingOptimizerInput,
): Promise<GenerateListingWithGeminiResult> {
  const apiKey = assertGeminiApiKey();
  const modelName = resolveGeminiModel();

  const { system, user } = buildListingOptimizerMessages(input);
  // generationConfig is passed inline on generateContent (not on the model
  // constructor) — the same pattern used in generate-review-analysis.ts.
  // Passing responseSchema on the model constructor via mergeGeminiGenerationConfig
  // does NOT work with SDK ^0.21.0 because the constructor strips unknown keys
  // before the request is built. It must be inline on generateContent.
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: {
      // responseSchema forces the model to emit JSON matching this shape exactly,
      // eliminating transient "Model returned invalid JSON" / 422 failures.
      responseMimeType: "application/json",
      responseSchema: LISTING_RESPONSE_SCHEMA,
      // Lower temperature for deterministic structured output — reduces inflated
      // self-scoring and produces more consistent keyword/CTA lists. Creative copy
      // quality is not meaningfully affected at 0.35 because the constraint lives
      // in the content (displacement directives, tone), not the sampling entropy.
      temperature: 0.35,
      topP: 0.95,
      // 4096 tokens gives comfortable headroom for a full 4000-char long description
      // (~1000 tokens) + title, short, 20 keywords, 8 CTAs, 8 tips, score breakdown
      // (~600 tokens) without risking the truncation-recovery guard firing in prod.
      // The previous 2540 limit was dangerously close to real-world output sizes.
      maxOutputTokens: 4096,
    },
  });

  // ── Finish-reason guard ───────────────────────────────────────────────────
  // The SDK's response.text() throws a generic Error (not InvalidModelOutputError)
  // when finishReason is MAX_TOKENS, SAFETY, RECITATION, or OTHER. Inspect the
  // candidate directly first so we can throw the right error type and trigger the
  // 422 retry path rather than falling through to a 500.
  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason as string | undefined;
  const isBlocked =
    finishReason && finishReason !== "STOP" && finishReason !== "1";

  // Always log in debug mode so you can see exactly what Gemini returned.
  if (
    process.env.DEBUG_GEMINI === "1" ||
    process.env.NODE_ENV !== "production"
  ) {
    console.log("[listing-generate] finishReason:", finishReason ?? "unknown");
    console.log(
      "[listing-generate] raw candidate text:",
      candidate?.content?.parts?.[0]?.text?.slice(0, 400) ?? "(empty)",
    );
  }

  if (isBlocked) {
    throw new InvalidModelOutputError(
      `Model response was blocked or truncated (finishReason: ${finishReason ?? "unknown"}). This is a transient Gemini issue — please try again.`,
      undefined,
    );
  }

  // ── Extract raw text ──────────────────────────────────────────────────────
  // response.text() can still throw even with STOP if parts is empty.
  // Wrap it so the error becomes an InvalidModelOutputError (422) not a 500.
  let rawText: string;
  try {
    rawText = result.response.text();
  } catch (textErr) {
    const msg = textErr instanceof Error ? textErr.message : String(textErr);
    throw new InvalidModelOutputError(
      `Model returned an empty or unreadable response: ${msg}. Please try again.`,
      undefined,
    );
  }

  // ── Truncation recovery guard ─────────────────────────────────────────────
  // Even with responseSchema, a network timeout or TPM spike can truncate the
  // output mid-object. Heal the three most common truncation patterns before
  // hitting JSON.parse so a partial response doesn't throw an unrecoverable error.
  let text = rawText?.trim() ?? "";
  if (process.env.DEBUG_GEMINI === "1" || process.env.NODE_ENV !== "production") {
    console.log("[listing-generate] raw text length:", text.length);
    console.log("[listing-generate] raw text preview:", text.slice(0, 500));
  }
  if (text.startsWith("{") && !text.endsWith("}")) {
    // Trailing comma after last key → strip it
    text = text.replace(/,\s*$/, "");
    // Count braces — append closing braces if needed
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    text += "}".repeat(Math.max(0, opens - closes));
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new InvalidModelOutputError(
      "Model returned invalid JSON. This is a transient Gemini issue — please try again.",
      undefined,
    );
  }

  const normalized = normalizeListingGenerationParsed(parsed);
  const clamped = clampListingGenerationParsed(normalized);

  if (process.env.DEBUG_GEMINI === "1" || process.env.NODE_ENV !== "production") {
    const rec = clamped as Record<string, unknown>;
    console.log("[listing-generate] parsed keys:", Object.keys(rec));
    console.log("[listing-generate] title:", rec.title);
    console.log("[listing-generate] shortDescription len:", typeof rec.shortDescription === "string" ? rec.shortDescription.length : "N/A");
    console.log("[listing-generate] fullDescription len:", typeof rec.fullDescription === "string" ? rec.fullDescription.length : "N/A");
    console.log("[listing-generate] keywordSuggestions count:", Array.isArray(rec.keywordSuggestions) ? rec.keywordSuggestions.length : "N/A");
    console.log("[listing-generate] asoScore:", rec.asoScore);
    console.log("[listing-generate] scoreBreakdown:", JSON.stringify(rec.scoreBreakdown));
  }

  const coreResult = listingGenerationCoreSchema.safeParse(clamped);
  if (!coreResult.success) {
    if (process.env.DEBUG_GEMINI === "1" || process.env.NODE_ENV !== "production") {
      console.error("[listing-generate] coreSchema failure:", JSON.stringify(coreResult.error.flatten(), null, 2));
    }
    throw new InvalidModelOutputError(
      "The model returned listing data that could not be validated after applying Play Store length limits. Try Regenerate.",
      coreResult.error,
    );
  }

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

  const final = listingGenerationOutputSchema.safeParse(data);
  if (!final.success) {
    throw new InvalidModelOutputError(
      "The model returned listing data that could not be validated after applying Play Store length limits. Try Regenerate.",
      final.error,
    );
  }
  return { data: final.data, asoScorePartial };
}
