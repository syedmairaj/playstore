import "server-only";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { clampListingGenerationParsed } from "@/lib/gemini/clamp-listing-generation-parsed";
import {
  assertGeminiApiKey,
  mergeGeminiGenerationConfig,
  resolveGeminiModel,
} from "@/lib/gemini/gemini-defaults";
import { InvalidModelOutputError } from "@/lib/gemini/invalid-model-output-error";
import { buildListingOptimizerMessages } from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  listingGenerationOutputSchema,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

export async function generateListingWithGemini(
  input: ListingOptimizerInput,
): Promise<ListingGenerationOutput> {
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

  const clamped = clampListingGenerationParsed(parsed);
  const validated = listingGenerationOutputSchema.safeParse(clamped);
  if (!validated.success) {
    throw new InvalidModelOutputError(
      "The model returned listing data that could not be validated after applying Play Store length limits. Try Regenerate.",
      validated.error,
    );
  }
  return validated.data;
}
