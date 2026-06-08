import "server-only";

import {
  geminiFlashCostBreakdown,
  serperUsdCost,
  type GeminiUsageCounts,
} from "@/lib/gemini/pricing";
import { DEFAULT_GEMINI_MODEL } from "@/lib/gemini/gemini-defaults";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const ADMIN_AI_TRANSACTION_LOGS_TABLE = "admin_ai_transaction_logs";

export type AiProviderService = "gemini" | "serper";

type LogAiTransactionBase = {
  userId: string;
  workspaceId?: string | null;
  featureSlug: string;
  creditsCharged: number;
};

export type LogGeminiAiTransactionInput = LogAiTransactionBase & {
  providerService: "gemini";
  model?: string;
  usage: GeminiUsageCounts | null;
};

export type LogSerperAiTransactionInput = LogAiTransactionBase & {
  providerService: "serper";
  /** Number of Serper API queries executed (typically countries.length). */
  totalQueriesRun: number;
};

export type LogAiTransactionInput =
  | LogGeminiAiTransactionInput
  | LogSerperAiTransactionInput;

/**
 * Inserts one COGS row via service role. Pricing is computed strictly before insert.
 * Failures are logged and swallowed so AI routes still return success to the user.
 */
export async function logAdminAiTransaction(
  input: LogAiTransactionInput,
): Promise<void> {
  const model = input.providerService === "gemini"
    ? (input.model ?? DEFAULT_GEMINI_MODEL)
    : undefined;

  let providerService: AiProviderService;
  let inputTokens = 0;
  let outputTokens = 0;
  let inputCostUsd = 0;
  let outputCostUsd = 0;
  let rawCogsUsd = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens: number | null = null;

  if (input.providerService === "serper") {
    providerService = "serper";
    const queries = Math.max(0, Math.floor(input.totalQueriesRun));
    rawCogsUsd = serperUsdCost(queries);
    inputTokens = queries;
    outputTokens = 0;
    inputCostUsd = rawCogsUsd;
    outputCostUsd = 0;
  } else {
    providerService = "gemini";
    const usage = input.usage ?? {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
    };
    promptTokens = usage.promptTokenCount;
    completionTokens = usage.candidatesTokenCount;
    totalTokens =
      usage.totalTokenCount ?? promptTokens + completionTokens;

    const breakdown = geminiFlashCostBreakdown(usage, model);
    inputTokens = breakdown.inputTokens;
    outputTokens = breakdown.outputTokens;
    inputCostUsd = breakdown.inputCostUsd;
    outputCostUsd = breakdown.outputCostUsd;
    rawCogsUsd = breakdown.rawCogsUsd;
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from(ADMIN_AI_TRANSACTION_LOGS_TABLE).insert({
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      feature_slug: input.featureSlug,
      provider_service: providerService,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      input_cost_usd: inputCostUsd,
      output_cost_usd: outputCostUsd,
      raw_cogs_usd: rawCogsUsd,
      raw_usd_cost: rawCogsUsd,
      credits_charged: input.creditsCharged,
    });
    if (error) {
      console.error(
        `[${ADMIN_AI_TRANSACTION_LOGS_TABLE}] insert failed:`,
        error.message,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${ADMIN_AI_TRANSACTION_LOGS_TABLE}] insert threw:`, message);
  }
}
