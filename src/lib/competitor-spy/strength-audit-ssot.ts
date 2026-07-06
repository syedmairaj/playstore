import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import {
  applySignalLifecycleStatus,
  filterActiveSignals,
  filterAuditSignals,
  isActiveSignal,
  isAuditSignal,
  readSignalLifecycleStatus,
  SIGNAL_LIFECYCLE_STATUS,
} from "@/lib/signals/signal-lifecycle";

export {
  readSignalLifecycleStatus,
  isActiveSignal as isActiveContextCompetitorStrength,
  isAuditSignal as isAuditQueueCompetitorStrength,
  filterActiveSignals as filterActiveContextCompetitorStrengths,
  filterAuditSignals as filterAuditQueueCompetitorStrengths,
  SIGNAL_LIFECYCLE_STATUS,
} from "@/lib/signals/signal-lifecycle";

export function isAuditManagedStrengthItem(
  item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">,
): boolean {
  return item.type === "competitor_strength" && readSignalLifecycleStatus(item) != null;
}

/** Active Context pillar — strict `status === ACTIVE`. */
export function isApprovedCompetitorStrength(
  item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">,
): boolean {
  return isActiveSignal(item);
}

/** Legacy keyword curation path — deprecated for Competitor Strengths pillar. */
export function isLegacyCompetitorStrengthStaging(
  item: Pick<OptimizationQueueItem, "type" | "metadata">,
): boolean {
  const meta = item.metadata ?? {};
  // Items explicitly created from gap analysis (from_gap_analysis: true) are
  // new-path items and must never be treated as legacy keyword curation entries.
  if (meta.from_gap_analysis === true) return false;

  return (
    meta.from_keyword_curation === true ||
    (item.type === "competitor_keyword" &&
      String(meta.category ?? meta.competitor_gap_category ?? "").toLowerCase() === "strength")
  );
}

export function isActiveContextVisibleQueueItem(item: OptimizationQueueItem): boolean {
  if (item.type === "competitor_strength") {
    return isActiveSignal(item);
  }

  if (isLegacyCompetitorStrengthStaging(item)) {
    return false;
  }

  return true;
}

export function filterQueueForActiveContextDisplay(
  items: OptimizationQueueItem[],
): OptimizationQueueItem[] {
  return items.filter(isActiveContextVisibleQueueItem);
}

export function filterQueueForAuditQueueDisplay(
  items: OptimizationQueueItem[],
): OptimizationQueueItem[] {
  return items.filter(isAuditSignal);
}

/** Remove from Active Context → demote to AUDIT (preserve vault row). */
export function demoteCompetitorStrengthItem(item: OptimizationQueueItem): OptimizationQueueItem {
  return applySignalLifecycleStatus(item, SIGNAL_LIFECYCLE_STATUS.AUDIT);
}

/** @deprecated Use demoteCompetitorStrengthItem — metadata-only patch removed. */
export function demoteCompetitorStrengthMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return metadata ?? {};
}
