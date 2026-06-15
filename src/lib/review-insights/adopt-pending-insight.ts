import type { SupabaseClient } from "@supabase/supabase-js";
import { addToOptimizationQueue } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import { REVIEW_ANALYSIS_STATUS_SUCCESS } from "@/lib/review-insights/constants";
import { resolveReviewInsightsCreditGate } from "@/lib/review-insights/credit-gate";
import {
  getPendingReviewInsightById,
  type PendingReviewInsight,
} from "@/lib/review-insights/pending-insights.service";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export type AdoptPendingInsightResult =
  | {
      ok: true;
      pending: PendingReviewInsight;
      queueItemId: string;
    }
  | {
      ok: false;
      code:
        | "gate_denied"
        | "not_found"
        | "not_pending"
        | "transaction_mismatch"
        | "queue_failed";
      message: string;
    };

/**
 * Commit phase — promote a single pending insight into Active Context (optimization queue).
 */
export async function adoptPendingReviewInsight(
  supabase: SupabaseClient,
  workspaceId: string,
  insightId: string,
  options: {
    locale: OptimizationQueueLocale;
    appId?: string | null;
    userId: string;
  },
): Promise<AdoptPendingInsightResult> {
  const pending = await getPendingReviewInsightById(supabase, workspaceId, insightId);
  if (!pending) {
    return { ok: false, code: "not_found", message: "Pending insight not found." };
  }

  if (pending.status !== "pending") {
    return { ok: false, code: "not_pending", message: "Insight is no longer pending." };
  }

  const gate = await resolveReviewInsightsCreditGate(supabase, workspaceId, {
    locale: options.locale,
    appId: options.appId,
    cluster: {
      packageName: pending.packageName,
      langCode: pending.langCode,
      country: pending.country,
    },
    userId: options.userId,
    purgeOnInvalid: false,
  });

  if (!gate.valid || gate.status !== "SUCCESS_PAID" || !gate.transactionId) {
    return { ok: false, code: "gate_denied", message: "Paid Sync Insights required." };
  }

  if (pending.analysisTransactionId !== gate.transactionId) {
    return {
      ok: false,
      code: "transaction_mismatch",
      message: "Insight belongs to an expired analysis run.",
    };
  }

  try {
    const result = await addToOptimizationQueue(
      supabase,
      workspaceId,
      options.locale,
      [
        {
          type: "review_pain_point",
          category: "review",
          content: pending.title.trim(),
          source: "review_analysis",
          sourceContext: "review_curation_adopt",
          sourceContextId: `pending_${pending.id}`,
          metadata: {
            category: "review",
            source_origin: "review_analysis",
            from_review_insights: true,
            review_derived: true,
            signal_kind: "pain_point",
            insight_category: pending.category,
            severity: pending.severity,
            impact_percent: Math.round(pending.impact * 100),
            description: pending.description,
            quote: pending.quote,
            package_name: pending.packageName,
            country: pending.country,
            lang_code: pending.langCode,
            analysis_transaction_id: gate.transactionId,
            last_analysis_timestamp: gate.lastAnalysisTimestamp,
            analysis_status: REVIEW_ANALYSIS_STATUS_SUCCESS,
            pending_insight_id: pending.id,
            explicitly_staged: true,
            move_to_active_context: true,
          },
        },
      ],
      { appId: options.appId, userId: options.userId },
    );

    if (result.addedCount === 0) {
      return { ok: false, code: "queue_failed", message: "Could not add to Active Context." };
    }

    const queueItemId = result.items.find(
      (item) => item.metadata.pending_insight_id === pending.id,
    )?.id ?? result.items[0]?.id;

    if (!queueItemId) {
      return { ok: false, code: "queue_failed", message: "Active Context item missing." };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from("review_pending_insights")
      .update({
        status: "adopted",
        queue_item_id: queueItemId,
        adopted_at: now,
        adopted_by: options.userId,
        updated_at: now,
      })
      .eq("workspace_id", workspaceId)
      .eq("id", pending.id)
      .eq("status", "pending");

    if (updateError) {
      return { ok: false, code: "queue_failed", message: "Failed to mark insight adopted." };
    }

    return {
      ok: true,
      pending: { ...pending, status: "adopted", queueItemId, updatedAt: now },
      queueItemId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "queue_failed", message };
  }
}
