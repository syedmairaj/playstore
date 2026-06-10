import "server-only";
import type { GenerationConfig } from "@google-cloud/vertexai";
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
 * Applies default sampling (`temperature`, `topP`, `maxOutputTokens`) while
 * preserving other keys from `existing` (e.g. `responseMimeType`).
 *
 * `maxOutputTokens: 2540` is a safety ceiling that prevents runaway generation
 * from exhausting the Gemini node's response budget and triggering 502 timeouts.
 * The listing optimizer JSON output comfortably fits within this budget; callers
 * that need a higher ceiling can pass `existing.maxOutputTokens` to override.
 */
export function mergeGeminiGenerationConfig(
  existing?: GenerationConfig,
): GenerationConfig {
  return {
    maxOutputTokens: 2540,
    ...existing,
    temperature: 0.7,
    topP: 0.95,
  };
}
