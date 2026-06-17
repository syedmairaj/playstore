import "server-only";

import { checkFinishReason, extractText } from "@/lib/ai/extract-model-text";
import type { GenerateContentResponse } from "@google/genai";
import {
  parseGeminiJsonText,
  type GeminiJsonParseResult,
} from "@/lib/gemini/gemini-json-parse-utils";

export {
  isTruncatedFinishReason,
  parseGeminiJsonText,
  prepareGeminiJsonText,
  type GeminiJsonParseFailureReason,
  type GeminiJsonParseResult,
} from "@/lib/gemini/gemini-json-parse-utils";

export function parseGeminiGenerateContentJson<T = unknown>(
  result: GenerateContentResponse,
): GeminiJsonParseResult<T> {
  const finish = checkFinishReason(result);
  const rawText = extractText(result);
  const truncated = finish.truncated || finish.finishReason === "MAX_TOKENS" || finish.finishReason === "LENGTH";

  return parseGeminiJsonText<T>(rawText, {
    truncated,
    finishReason: finish.finishReason,
  });
}
