import type { SupabaseClient } from "@supabase/supabase-js";
import { addToOptimizationQueue } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import type { ReviewInsightCategory } from "@/lib/review-insights/pending-insights.types";
import type { IssueSeverity } from "@/lib/gemini/generate-review-analysis";

export type RestoreStagedReviewResult =
  | { ok: true; queueItemId: string; title: string }
  | { ok: false; code: "not_found" | "restore_failed"; message: string };

/**
 * Restore — move archived insight directly back into Active Context (optimization queue).
 */
export async function restoreStagedReviewIssue(
  supabase: SupabaseClient,
  workspaceId: string,
  backlogId: string,
  options: {
    locale: OptimizationQueueLocale;
    appId?: string | null;
    userId: string;
  },
): Promise<RestoreStagedReviewResult> {
  const { data: row, error } = await supabase
    .from("workspace_listing_backlog")
    .select(
      "id, package_name, country_code, issue_title, issue_description, severity, impact, metadata",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", backlogId)
    .eq("is_implemented", true)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, code: "not_found", message: "Archived insight not found." };
  }

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const category = (meta.category as ReviewInsightCategory) ?? "UX";
  const impactScore =
    typeof meta.original_impact_score === "number"
      ? meta.original_impact_score
      : Math.round(Number(row.impact) * 100);
  const title = String(row.issue_title).trim();
  const originalStagedAt =
    typeof meta.original_staged_at === "string"
      ? meta.original_staged_at
      : typeof meta.staged_at === "string"
        ? meta.staged_at
        : undefined;
  const queueIndex =
    typeof meta.queue_index === "number" && Number.isFinite(meta.queue_index)
      ? Math.max(0, Math.floor(meta.queue_index))
      : undefined;

  try {
    const queueResult = await addToOptimizationQueue(
      supabase,
      workspaceId,
      options.locale,
      [
        {
          type: "review_pain_point",
          category: "review",
          content: title,
          source: "review_analysis",
          sourceContext: "common_issues_theme",
          sourceContextId: `restore_${backlogId}`,
          metadata: {
            category: "review",
            source_origin: "review_analysis",
            from_review_insights: true,
            review_derived: true,
            signal_kind: "pain_point",
            insight_category: category,
            severity: row.severity as IssueSeverity,
            impact_percent: impactScore,
            original_impact_score: impactScore,
            description: String(row.issue_description),
            quote: typeof meta.quote === "string" ? meta.quote : "",
            package_name: String(row.package_name),
            country: String(row.country_code),
            lang_code: typeof meta.lang_code === "string" ? meta.lang_code : "en",
            competitor_name:
              typeof meta.competitor_name === "string" ? meta.competitor_name : null,
            archive_reason: "active",
            source_type:
              typeof meta.source_type === "string" ? meta.source_type : "common_issues_cluster",
            explicitly_staged: true,
            move_to_active_context: true,
            ...(originalStagedAt ? { staged_date: originalStagedAt, original_staged_at: originalStagedAt } : {}),
            ...(typeof meta.review_id === "string" ? { review_id: meta.review_id } : {}),
          },
        },
      ],
      {
        appId: options.appId,
        userId: options.userId,
        insertAtIndex: queueIndex,
      },
    );

    if (queueResult.addedCount === 0) {
      const existing = queueResult.items.find(
        (row) =>
          row.type === "review_pain_point" &&
          row.content.trim().toLowerCase() === title.toLowerCase(),
      );
      if (!existing?.id) {
        return { ok: false, code: "restore_failed", message: "Could not restore to Active Context." };
      }

      await supabase
        .from("workspace_listing_backlog")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", backlogId);

      return { ok: true, queueItemId: existing.id, title };
    }

    const queueItemId = queueResult.items.find(
      (row) =>
        row.type === "review_pain_point" &&
        row.content.trim().toLowerCase() === title.toLowerCase(),
    )?.id ?? queueResult.items[0]?.id;
    if (!queueItemId) {
      return { ok: false, code: "restore_failed", message: "Queue item missing after restore." };
    }

    await supabase
      .from("workspace_listing_backlog")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("id", backlogId);

    return { ok: true, queueItemId, title };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, code: "restore_failed", message };
  }
}
