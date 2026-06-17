/**
 * @deprecated Import from `@/lib/signals/signal-lifecycle` — re-exported for compatibility.
 */
export {
  SIGNAL_LIFECYCLE_STATUS as COMPETITOR_STRENGTH_STATUS,
  type SignalLifecycleStatus as CompetitorStrengthStatus,
  isSignalLifecycleStatus as isCompetitorStrengthStatus,
  readSignalLifecycleStatus as readCompetitorStrengthStatus,
  isActiveSignal as isActiveContextCompetitorStrength,
  isAuditSignal as isAuditQueueCompetitorStrength,
  filterActiveSignals as filterActiveContextCompetitorStrengths,
  filterAuditSignals as filterAuditQueueCompetitorStrengths,
  applySignalLifecycleStatus,
  stripLegacyLifecycleMetadata,
} from "@/lib/signals/signal-lifecycle";

import {
  SIGNAL_LIFECYCLE_STATUS,
  stripLegacyLifecycleMetadata,
  type SignalLifecycleStatus,
} from "@/lib/signals/signal-lifecycle";

/** @deprecated Use applySignalLifecycleStatus on the full queue item. */
export function competitorStrengthLifecycleMetadata(
  status: SignalLifecycleStatus,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return stripLegacyLifecycleMetadata(extra);
}

/** @deprecated Use SIGNAL_LIFECYCLE_STATUS.ACTIVE on queue item.status. */
export const LEGACY_ACTIVE = SIGNAL_LIFECYCLE_STATUS.ACTIVE;
