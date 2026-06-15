import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue";
import {
  readRawOptimizationQueue,
  removeFromOptimizationQueue,
} from "@/lib/optimization-queue/optimization-queue.service";
import type { ReviewInsightCategory } from "@/lib/review-insights/pending-insights.types";
import type { IssueSeverity } from "@/lib/gemini/generate-review-analysis";

export type ArchiveReviewFromActiveResult =
  | { ok: true; backlogId: string }
  | { ok: false; code: "not_found" | "archive_failed"; message: string };

export type ArchiveReviewFromActiveOptions = {
  locale: OptimizationQueueLocale;
  appId?: string | null;
  userId: string;
  /** Fallback when queue id is stale or client-only. */
  title?: string;
  content?: string;
  type?: OptimizationQueueItem["type"];
  metadata?: Record<string, unknown>;
};

const ARCHIVABLE_REVIEW_TYPES = new Set<OptimizationQueueItem["type"]>([
  "review_pain_point",
  "feature_request",
]);

function normalizeContent(value: string): string {
  return value.trim().toLowerCase();
}

function isArchivableReviewItem(item: OptimizationQueueItem): boolean {
  return ARCHIVABLE_REVIEW_TYPES.has(item.type);
}

function resolveArchivableQueueItem(
  items: OptimizationQueueItem[],
  queueItemId: string,
  title?: string,
): OptimizationQueueItem | null {
  const byId = items.find((item) => item.id === queueItemId);
  if (byId && isArchivableReviewItem(byId)) {
    return byId;
  }

  const byMetaQueueId = items.find(
    (item) =>
      isArchivableReviewItem(item) &&
      typeof item.metadata?.queue_item_id === "string" &&
      item.metadata.queue_item_id === queueItemId,
  );
  if (byMetaQueueId) return byMetaQueueId;

  const lookupTitle = normalizeContent(title ?? "");
  if (lookupTitle) {
    const byTitle = items.find(
      (item) =>
        isArchivableReviewItem(item) &&
        normalizeContent(item.content) === lookupTitle,
    );
    if (byTitle) return byTitle;
  }

  return null;
}

function buildFallbackArchiveItem(
  queueItemId: string,
  options: ArchiveReviewFromActiveOptions,
): OptimizationQueueItem | null {
  const content = (options.content ?? options.title ?? "").trim();
  if (!content) return null;

  const type =
    options.type && ARCHIVABLE_REVIEW_TYPES.has(options.type)
      ? options.type
      : "review_pain_point";

  return {
    id: queueItemId,
    type,
    category: "review",
    content,
    source: "review_analysis",
    sourceContext: "common_issues_theme",
    language: options.locale,
    stagedAt: new Date().toISOString(),
    metadata: {
      ...(options.metadata ?? {}),
      explicitly_staged: true,
    },
  };
}

/**
 * Archive — remove from Active Context (queue) and persist to Optimization History.
 */
export async function archiveReviewInsightFromActiveContext(
  supabase: SupabaseClient,
  workspaceId: string,
  queueItemId: string,
  options: ArchiveReviewFromActiveOptions,
): Promise<ArchiveReviewFromActiveResult> {
  const items = await readRawOptimizationQueue(
    supabase,
    workspaceId,
    options.locale,
    options.appId,
  );

  const resolvedItem =
    resolveArchivableQueueItem(items, queueItemId, options.title ?? options.content) ??
    buildFallbackArchiveItem(queueItemId, options);

  if (!resolvedItem || !isArchivableReviewItem(resolvedItem)) {
    return { ok: false, code: "not_found", message: "Active Context insight not found." };
  }

  const meta = { ...resolvedItem.metadata, ...(options.metadata ?? {}) };
  const archivedAt = new Date().toISOString();
  const queueIndex = items.findIndex((item) => item.id === resolvedItem.id);
  const packageName = String(meta.package_name ?? "").trim();
  const countryCode = String(meta.country ?? "us").trim().toLowerCase();
  const title = resolvedItem.content.trim();
  const description = String(meta.description ?? title).trim();
  const severity = (meta.severity as IssueSeverity) ?? "MEDIUM";
  const impact =
    typeof meta.impact_percent === "number"
      ? meta.impact_percent / 100
      : typeof meta.original_impact_score === "number"
        ? meta.original_impact_score / 100
        : 0.4;

  const backlogMetadata = {
    competitor_name:
      typeof meta.competitor_name === "string" ? meta.competitor_name : null,
    staged_at: typeof meta.staged_date === "string" ? meta.staged_date : resolvedItem.stagedAt,
    original_staged_at: resolvedItem.stagedAt,
    queue_index: queueIndex >= 0 ? queueIndex : 0,
    archived_at: archivedAt,
    original_impact_score:
      typeof meta.original_impact_score === "number"
        ? meta.original_impact_score
        : Math.round(impact * 100),
    quote: typeof meta.quote === "string" ? meta.quote : "",
    category: (meta.insight_category as ReviewInsightCategory) ?? "UX",
    source_type: typeof meta.source_type === "string" ? meta.source_type : "common_issues_cluster",
    archive_reason: "archived" as const,
    queue_item_id: resolvedItem.id,
    lang_code: typeof meta.lang_code === "string" ? meta.lang_code : "en",
    ...(typeof meta.review_id === "string" ? { review_id: meta.review_id } : {}),
  };

  const { data: backlogRow, error: backlogError } = await supabase
    .from("workspace_listing_backlog")
    .upsert(
      {
        workspace_id: workspaceId,
        package_name: packageName || "unknown.app",
        country_code: countryCode,
        issue_title: title,
        issue_description: description,
        severity,
        impact,
        is_implemented: true,
        added_by: options.userId,
        metadata: backlogMetadata,
      },
      {
        onConflict: "workspace_id,package_name,country_code,issue_title",
        ignoreDuplicates: false,
      },
    )
    .select("id")
    .single();

  if (backlogError || !backlogRow?.id) {
    return {
      ok: false,
      code: "archive_failed",
      message: backlogError?.message ?? "Failed to save to archive.",
    };
  }

  const queueIdToRemove = items.some((item) => item.id === resolvedItem.id)
    ? resolvedItem.id
    : items.some((item) => item.id === queueItemId)
      ? queueItemId
      : null;

  if (queueIdToRemove) {
    try {
      await removeFromOptimizationQueue(
        supabase,
        workspaceId,
        options.locale,
        queueIdToRemove,
        {
          appId: options.appId,
          userId: options.userId,
        },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, code: "archive_failed", message };
    }
  }

  return { ok: true, backlogId: String(backlogRow.id) };
}
