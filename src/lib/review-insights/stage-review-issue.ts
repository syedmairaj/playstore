import type { SupabaseClient } from "@supabase/supabase-js";
import { addToOptimizationQueue } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  inferCategoryFromIssue,
  normalizeReviewInsightCategory,
  type ReviewInsightCategory,
} from "@/lib/review-insights/pending-insights.types";
import type { IssueItem, IssueSeverity } from "@/lib/gemini/generate-review-analysis";
import { stageSignal } from "@/lib/staging-vault/stageSignal";

export type StageReviewIssueSource = "common_issues_cluster" | "individual_review";

export type StageReviewIssueInput = {
  workspaceId: string;
  packageName: string;
  countryCode: string;
  langCode: string;
  locale: OptimizationQueueLocale;
  appId?: string | null;
  userId: string;
  competitorName?: string | null;
  sourceType: StageReviewIssueSource;
  issue: {
    title: string;
    description: string;
    severity: IssueSeverity;
    impact: number;
    quote?: string;
    category?: ReviewInsightCategory;
  };
  sourceContextId: string;
};

export type StageReviewIssueResult =
  | {
      ok: true;
      queueItemId: string;
      vaultSignalId: string;
      stagedAt: string;
      title: string;
    }
  | {
      ok: false;
      code: "validation" | "queue_failed" | "vault_failed";
      message: string;
    };

function vaultSeverity(severity: IssueSeverity): "critical" | "medium" | "low" {
  const map = { CRITICAL: "critical", MEDIUM: "medium", LOW: "low" } as const;
  return map[severity] ?? "medium";
}

/**
 * MoveToActiveContext — adds insight directly to optimization queue (Active Context).
 * Archive is a separate explicit action from the Listing Optimizer.
 */
export async function stageReviewIssueToActiveContext(
  supabase: SupabaseClient,
  input: StageReviewIssueInput,
): Promise<StageReviewIssueResult> {
  const title = input.issue.title.trim();
  const description = input.issue.description.trim();
  if (!title || !description) {
    return { ok: false, code: "validation", message: "Title and description are required." };
  }

  const category =
    input.issue.category ??
    normalizeReviewInsightCategory(
      inferCategoryFromIssue({
        title,
        description,
        severity: input.issue.severity,
        impact: input.issue.impact,
        quote: input.issue.quote,
      } as IssueItem),
    );

  const stagedAt = new Date().toISOString();
  const impactScore = Math.round(input.issue.impact * 100);
  const competitorName = input.competitorName?.trim() || null;

  try {
    const queueResult = await addToOptimizationQueue(
      supabase,
      input.workspaceId,
      input.locale,
      [
        {
          type: "review_pain_point",
          category: "review",
          content: title,
          source: "review_analysis",
          sourceContext: "common_issues_theme",
          sourceContextId: input.sourceContextId,
          metadata: {
            category: "review",
            source_origin: "review_analysis",
            from_review_insights: true,
            review_derived: true,
            signal_kind: "pain_point",
            insight_category: category,
            severity: input.issue.severity,
            impact_percent: impactScore,
            original_impact_score: impactScore,
            description,
            quote: input.issue.quote?.trim() || "",
            package_name: input.packageName,
            country: input.countryCode.toLowerCase(),
            lang_code: input.langCode,
            competitor_name: competitorName,
            staged_date: stagedAt,
            archive_reason: "active",
            source_type: input.sourceType,
            explicitly_staged: true,
            move_to_active_context: true,
            ...(input.sourceType === "individual_review"
              ? { review_id: input.sourceContextId }
              : {}),
          },
        },
      ],
      { appId: input.appId, userId: input.userId },
    );

    if (queueResult.addedCount === 0) {
      return { ok: false, code: "queue_failed", message: "Could not add to Active Context." };
    }

    const queueItemId = queueResult.items[0]?.id;
    if (!queueItemId) {
      return { ok: false, code: "queue_failed", message: "Active Context item missing." };
    }

    let vaultSignalId = queueItemId;
    try {
      const vault = await stageSignal(supabase, {
        workspace_id: input.workspaceId,
        signal_type: "review_issue",
        source: "review_analysis",
        source_context: "common_issues_theme",
        source_context_id: input.sourceContextId,
        content: title,
        language: input.locale,
        source_app_id: input.appId ?? undefined,
        metadata: {
          description,
          severity: vaultSeverity(input.issue.severity),
          impactPercent: impactScore,
          quote: input.issue.quote,
          competitor_name: competitorName,
          staged_at: stagedAt,
          queue_item_id: queueItemId,
        },
      });
      vaultSignalId = vault.id;
    } catch {
      // Vault mirror is best-effort; queue is authoritative.
    }

    return {
      ok: true,
      queueItemId,
      vaultSignalId,
      stagedAt,
      title,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "queue_failed", message };
  }
}
