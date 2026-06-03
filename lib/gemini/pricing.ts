import "server-only";

import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini/gemini-defaults";

/**
 * Gemini 2.5 Flash list pricing (USD per 1M tokens).
 * @see https://ai.google.dev/pricing
 */
export const GEMINI_25_FLASH_USD_PER_MILLION = {
  input: 0.075,
  output: 0.3,
} as const;

/** Serper.dev Play Store search — USD per API query (country search). */
export const SERPER_USD_PER_QUERY = 0.001;

export type GeminiUsageCounts = {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount?: number;
};

export type GeminiCostBreakdown = {
  inputTokens: number;
  outputTokens: number;
  inputCostUsd: number;
  outputCostUsd: number;
  rawCogsUsd: number;
};

function usesGemini25FlashRates(model: string | undefined): boolean {
  const m = (model ?? DEFAULT_GEMINI_MODEL).toLowerCase();
  return m.includes("2.5-flash") || m === "gemini-2.5-flash";
}

/** Fractional USD from Gemini token counts for gemini-2.5-flash (strict admin COGS). */
export function geminiFlashCostBreakdown(
  usage: GeminiUsageCounts,
  model?: string,
): GeminiCostBreakdown {
  const inputTokens = Math.max(0, usage.promptTokenCount);
  const outputTokens = Math.max(0, usage.candidatesTokenCount);

  if (!usesGemini25FlashRates(model)) {
    return {
      inputTokens,
      outputTokens,
      inputCostUsd: 0,
      outputCostUsd: 0,
      rawCogsUsd: 0,
    };
  }

  const inputCostUsd =
    (inputTokens / 1_000_000) * GEMINI_25_FLASH_USD_PER_MILLION.input;
  const outputCostUsd =
    (outputTokens / 1_000_000) * GEMINI_25_FLASH_USD_PER_MILLION.output;

  return {
    inputTokens,
    outputTokens,
    inputCostUsd,
    outputCostUsd,
    rawCogsUsd: inputCostUsd + outputCostUsd,
  };
}

/** Fractional USD from Gemini `usageMetadata` token counts. */
export function geminiFlashUsdCost(
  usage: GeminiUsageCounts,
  model?: string,
): number {
  return geminiFlashCostBreakdown(usage, model).rawCogsUsd;
}

/** Serper COGS: one billed query per country search in a run. */
export function serperUsdCost(totalQueriesRun: number): number {
  const n = Math.max(0, Math.floor(totalQueriesRun));
  return n * SERPER_USD_PER_QUERY;
}

/** Normalizes REST or SDK usage metadata shapes. */
export function parseGeminiUsageMetadata(
  raw: unknown,
): GeminiUsageCounts | null {
  if (!raw || typeof raw !== "object") return null;
  const meta = raw as Record<string, unknown>;
  const prompt =
    typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : 0;
  const candidates =
    typeof meta.candidatesTokenCount === "number"
      ? meta.candidatesTokenCount
      : 0;
  const total =
    typeof meta.totalTokenCount === "number" ? meta.totalTokenCount : undefined;
  if (prompt === 0 && candidates === 0 && total == null) return null;
  return {
    promptTokenCount: prompt,
    candidatesTokenCount: candidates,
    totalTokenCount: total,
  };
}
