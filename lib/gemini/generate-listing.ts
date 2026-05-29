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

  const rawText = result.response.text();

  // ── Truncation recovery guard ─────────────────────────────────────────────
  // Even with responseSchema, a network timeout or TPM spike can truncate the
  // output mid-object. Heal the three most common truncation patterns before
  // hitting JSON.parse so a partial response doesn't throw an unrecoverable error.
  let text = rawText?.trim() ?? "";
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
  const coreResult = listingGenerationCoreSchema.safeParse(clamped);
  if (!coreResult.success) {
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
