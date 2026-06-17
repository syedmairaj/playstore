import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";

/**
 * Auto-bridged review pain points (unpaid sync bridge) are hidden from the public
 * optimization queue read. User-initiated MoveToActiveContext / Stage Issue /
 * Adopt flows are always visible in Active Context.
 */
export function isReviewDerivedQueueItem(item: OptimizationQueueItem): boolean {
  if (item.type !== "review_pain_point") return false;

  const meta = item.metadata ?? {};

  if (meta.explicitly_staged === true || meta.move_to_active_context === true) {
    return false;
  }
  if (typeof meta.backlog_id === "string" && meta.backlog_id.length > 0) {
    return false;
  }
  if (typeof meta.pending_insight_id === "string" && meta.pending_insight_id.length > 0) {
    return false;
  }
  if (item.sourceContext === "review_curation_adopt") {
    return false;
  }

  return meta.review_derived === true || meta.from_review_insights === true;
}
