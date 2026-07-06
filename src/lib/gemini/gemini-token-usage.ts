import "server-only";

import type { GenerateContentResponse } from "@google/genai";
import { extractUsageMetadata } from "@/lib/ai/extract-model-text";
import { parseGeminiUsageMetadata } from "@/lib/gemini/pricing";

export type ModularGeminiCallResult<T> = {
  data: T;
  tokensUsed: number;
};

/** Resolve total tokens from a Gemini GenerateContentResponse. */
export function resolveTokensFromGeminiResponse(
  result: GenerateContentResponse | null | undefined,
): number {
  const usage = parseGeminiUsageMetadata(extractUsageMetadata(result));
  if (!usage) return 0;
  if (typeof usage.totalTokenCount === "number" && usage.totalTokenCount > 0) {
    return usage.totalTokenCount;
  }
  return Math.max(0, usage.promptTokenCount + usage.candidatesTokenCount);
}

export function sumGeminiTokens(...counts: number[]): number {
  return counts.reduce((sum, n) => sum + Math.max(0, n), 0);
}
