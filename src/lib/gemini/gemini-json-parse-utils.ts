import { parseJsonWithRecovery, recoverPartialJson } from "./json-recovery";

export type GeminiJsonParseFailureReason = "empty" | "parse_failed" | "truncated";

export type GeminiJsonParseResult<T> =
  | { ok: true; value: T; recovered: boolean; truncated: boolean; finishReason?: string }
  | {
      ok: false;
      reason: GeminiJsonParseFailureReason;
      finishReason?: string;
      preview?: string;
    };

/** Finish reasons that indicate the model ran out of output budget. */
export function isTruncatedFinishReason(finishReason: string | undefined): boolean {
  if (!finishReason) return false;
  return finishReason === "MAX_TOKENS" || finishReason === "LENGTH";
}

function stripCodeFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

/**
 * Heal common truncation artefacts before JSON.parse.
 * Preserves UTF-8 (EN/AR) — structural edits only.
 */
export function prepareGeminiJsonText(raw: string): { text: string; recovered: boolean } {
  let text = stripCodeFences(raw.trim());
  if (!text) return { text: "", recovered: false };

  try {
    JSON.parse(text);
    return { text, recovered: false };
  } catch {
    // fall through to structural recovery
  }

  const recoveredText = recoverPartialJson(text);
  if (recoveredText) {
    return { text: recoveredText, recovered: true };
  }

  if (text.startsWith("{")) {
    text = text.replace(/,\s*$/, "");
    const opens = (text.match(/\{/g) ?? []).length;
    const closes = (text.match(/\}/g) ?? []).length;
    if (opens > closes) {
      text += "}".repeat(opens - closes);
      return { text, recovered: true };
    }
  }

  return { text, recovered: false };
}

export function parseGeminiJsonText<T = unknown>(
  rawText: string,
  options?: { truncated?: boolean; finishReason?: string },
): GeminiJsonParseResult<T> {
  const trimmed = rawText?.trim() ?? "";
  if (!trimmed) {
    return {
      ok: false,
      reason: options?.truncated ? "truncated" : "empty",
      finishReason: options?.finishReason,
    };
  }

  const { text, recovered } = prepareGeminiJsonText(trimmed);
  const parsed = parseJsonWithRecovery<T>(text);

  if (parsed !== null) {
    return {
      ok: true,
      value: parsed,
      recovered,
      truncated: Boolean(options?.truncated),
      finishReason: options?.finishReason,
    };
  }

  return {
    ok: false,
    reason: options?.truncated ? "truncated" : "parse_failed",
    finishReason: options?.finishReason,
    preview: trimmed.slice(0, 240),
  };
}
