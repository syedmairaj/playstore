import type { SupabaseClient } from "@supabase/supabase-js";
import {
  REVIEW_ANALYSIS_FEATURE,
  REVIEW_ANALYSIS_MONTHLY_LIMIT,
} from "@/lib/review-insights/constants";

function startOfUtcMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** First day of next UTC month — shown in limit-reached UX. */
export function nextReviewAnalysisResetIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Count paid review analyses this calendar month (UTC) from credits_ledger debits.
 * Refunded failed runs are excluded so they do not consume the monthly quota.
 */
export async function countMonthlyReviewAnalyses(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const since = startOfUtcMonth();

  const { data: debits, error: debitError } = await supabase
    .from("credits_ledger")
    .select("id")
    .eq("workspace_id", workspaceId)
    .lt("amount", 0)
    .gte("created_at", since)
    .contains("meta", { feature: REVIEW_ANALYSIS_FEATURE });

  if (debitError) {
    console.warn("[review-insights] monthly usage count failed:", debitError.message);
    return 0;
  }

  if (!debits?.length) return 0;

  const { data: refunds, error: refundError } = await supabase
    .from("credits_ledger")
    .select("meta")
    .eq("workspace_id", workspaceId)
    .eq("source_type", "refund")
    .gte("created_at", since);

  if (refundError) {
    console.warn("[review-insights] monthly refund lookup failed:", refundError.message);
    return debits.length;
  }

  const refundedDebitIds = new Set(
    (refunds ?? [])
      .map((row) => {
        const meta = row.meta as { refunded_ledger_id?: string } | null;
        return typeof meta?.refunded_ledger_id === "string"
          ? meta.refunded_ledger_id
          : null;
      })
      .filter((id): id is string => Boolean(id)),
  );

  return debits.filter((debit) => !refundedDebitIds.has(debit.id)).length;
}

export async function readReviewAnalysisUsage(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<{
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}> {
  const used = await countMonthlyReviewAnalyses(supabase, workspaceId);
  const limit = REVIEW_ANALYSIS_MONTHLY_LIMIT;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetsAt: nextReviewAnalysisResetIso(),
  };
}
