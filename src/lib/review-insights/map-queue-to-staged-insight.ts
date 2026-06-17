import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import { normalizeReviewInsightCategory } from "@/lib/review-insights/pending-insights.types";
import type { IssueSeverity } from "@/lib/gemini/generate-review-analysis";
import {
  readGrowthStrategyTag,
  readImpactPercent,
} from "@/lib/review-insights/growth-strategy-tags";

function isStagedReviewQueueItem(item: OptimizationQueueItem): boolean {
  const meta = item.metadata ?? {};
  if (meta.explicitly_staged === true || meta.move_to_active_context === true) {
    return true;
  }
  if (typeof meta.backlog_id === "string" && meta.backlog_id.length > 0) {
    return true;
  }
  return (
    item.type === "review_pain_point" &&
    (item.metadata.from_review_insights === true ||
      item.metadata.review_derived === true ||
      item.sourceContext === "common_issues_theme")
  );
}

export function mapQueueItemToStagedInsight(
  item: OptimizationQueueItem,
  workspaceId: string,
): PendingReviewInsight {
  const meta = item.metadata;
  const severity = (meta.severity as IssueSeverity) ?? "MEDIUM";
  const impact =
    typeof meta.impact_percent === "number"
      ? meta.impact_percent / 100
      : typeof meta.original_impact_score === "number"
        ? meta.original_impact_score / 100
        : 0;

  return {
    id: item.id,
    workspaceId,
    competitorInsightsId: null,
    analysisTransactionId: null,
    packageName: String(meta.package_name ?? ""),
    langCode: String(meta.lang_code ?? "en"),
    country: String(meta.country ?? "us"),
    title: item.content,
    description: String(meta.description ?? item.content),
    severity,
    impact,
    quote: String(meta.quote ?? ""),
    category: normalizeReviewInsightCategory(meta.insight_category),
    status: "adopted",
    queueItemId: item.id,
    clusterIndex: -1,
    createdAt: item.stagedAt,
    updatedAt: item.stagedAt,
    growthStrategyTag: readGrowthStrategyTag(meta),
    impactPercent: readImpactPercent(meta),
  };
}

export function mergeStagedQueueIntoAdopted(
  adopted: PendingReviewInsight[],
  queueItems: OptimizationQueueItem[],
  workspaceId: string,
): PendingReviewInsight[] {
  const seen = new Set(adopted.map((i) => i.title.trim().toLowerCase()));
  const extras = queueItems
    .filter(isStagedReviewQueueItem)
    .filter((item) => !seen.has(item.content.trim().toLowerCase()))
    .map((item) => mapQueueItemToStagedInsight(item, workspaceId));

  return extras.length > 0 ? [...adopted, ...extras] : adopted;
}
