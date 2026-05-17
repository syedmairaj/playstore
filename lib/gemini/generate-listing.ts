import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { clampListingGenerationParsed } from "@/lib/gemini/clamp-listing-generation-parsed";
import {
  assertGeminiApiKey,
  mergeGeminiGenerationConfig,
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
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
    generationConfig: mergeGeminiGenerationConfig({
      responseMimeType: "application/json",
    }),
  });

  const result = await model.generateContent(user);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Model returned invalid JSON");
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
