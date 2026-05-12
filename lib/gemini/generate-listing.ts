import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildListingOptimizerMessages } from "@/lib/prompts/listing-optimizer";
import type { ListingOptimizerInput } from "@/lib/types/listing";
import {
  listingGenerationOutputSchema,
  type ListingGenerationOutput,
} from "@/lib/validation/listing-output";

export async function generateListingWithGemini(
  input: ListingOptimizerInput,
): Promise<ListingGenerationOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const modelName = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  const { system, user } = buildListingOptimizerMessages(input);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: system,
    generationConfig: {
      temperature: 0.65,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent(user);
  const text = result.response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Model returned invalid JSON");
  }

  return listingGenerationOutputSchema.parse(parsed);
}
