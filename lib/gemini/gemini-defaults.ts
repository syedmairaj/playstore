import "server-only";
import type { GenerationConfig } from "@google/generative-ai";
import { shouldLogGeminiDebug } from "@/lib/gemini/log-gemini-env";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export function resolveGeminiModel(): string {
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

/** Returns the API key or throws with a consistent message (no duplicate checks elsewhere). */
export function assertGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  if (shouldLogGeminiDebug()) {
    console.log("Using Gemini model:", resolveGeminiModel());
  }
  return apiKey;
}

/**
 * Applies default sampling (`temperature`, `topP`) while preserving other
 * keys from `existing` (e.g. `responseMimeType`, `maxOutputTokens`).
 */
export function mergeGeminiGenerationConfig(
  existing?: GenerationConfig,
): GenerationConfig {
  return {
    ...existing,
    temperature: 0.7,
    topP: 0.95,
  };
}
