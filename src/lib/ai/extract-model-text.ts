/**
 * Text + finish-reason helpers for @google/genai GenerateContentResponse.
 */

import type { GenerateContentResponse } from "@google/genai";

const SUCCESS_FINISH_REASONS = new Set(["STOP", "1", "FINISH_REASON_UNSPECIFIED", ""]);

const BLOCKED_FINISH_REASONS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "LANGUAGE",
  "OTHER",
]);

export type FinishReasonCheck =
  | { ok: true; finishReason?: string }
  | { ok: false; finishReason: string; blocked: boolean; truncated: boolean };

export function getFirstCandidate(result: GenerateContentResponse | null | undefined) {
  return result?.candidates?.[0];
}

export function checkFinishReason(
  result: GenerateContentResponse | null | undefined,
): FinishReasonCheck {
  const candidate = getFirstCandidate(result);
  const finishReason = String(candidate?.finishReason ?? "").trim();

  if (!finishReason || SUCCESS_FINISH_REASONS.has(finishReason)) {
    return { ok: true, finishReason: finishReason || undefined };
  }

  if (finishReason === "MAX_TOKENS" || finishReason === "LENGTH") {
    return { ok: false, finishReason, blocked: false, truncated: true };
  }

  if (BLOCKED_FINISH_REASONS.has(finishReason)) {
    return { ok: false, finishReason, blocked: true, truncated: false };
  }

  return { ok: false, finishReason, blocked: true, truncated: false };
}

export function isBlockedFinishReason(finishReason: string | undefined): boolean {
  if (!finishReason) return false;
  return BLOCKED_FINISH_REASONS.has(finishReason);
}

/**
 * Read model text via the SDK's `.text` property (getter), with parts fallback.
 */
export function extractText(result: GenerateContentResponse | null | undefined): string {
  if (!result) return "";

  const fromProperty = result.text?.trim();
  if (fromProperty) return fromProperty;

  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const fromParts = parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();

  return fromParts;
}

/** Usage metadata on @google/genai GenerateContentResponse (not nested under `.response`). */
export function extractUsageMetadata(
  result: GenerateContentResponse | null | undefined,
): GenerateContentResponse["usageMetadata"] | null {
  if (!result) return null;
  return result.usageMetadata ?? null;
}
