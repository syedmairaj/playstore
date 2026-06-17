import type { OptimizationQueueItem } from "@/lib/optimization-queue";

/** Industry-standard ASO signal lifecycle (vault optimization_queue item `status`). */
export const SIGNAL_LIFECYCLE_STATUS = {
  DISCOVERY: "DISCOVERY",
  AUDIT: "AUDIT",
  ACTIVE: "ACTIVE",
} as const;

export type SignalLifecycleStatus =
  (typeof SIGNAL_LIFECYCLE_STATUS)[keyof typeof SIGNAL_LIFECYCLE_STATUS];

export function isSignalLifecycleStatus(value: unknown): value is SignalLifecycleStatus {
  return (
    value === SIGNAL_LIFECYCLE_STATUS.DISCOVERY ||
    value === SIGNAL_LIFECYCLE_STATUS.AUDIT ||
    value === SIGNAL_LIFECYCLE_STATUS.ACTIVE
  );
}

const LEGACY_STATUS_MAP: Record<string, SignalLifecycleStatus> = {
  DRAFT: SIGNAL_LIFECYCLE_STATUS.DISCOVERY,
  DISCOVERY: SIGNAL_LIFECYCLE_STATUS.DISCOVERY,
  AUDIT_QUEUE: SIGNAL_LIFECYCLE_STATUS.AUDIT,
  AUDIT: SIGNAL_LIFECYCLE_STATUS.AUDIT,
  ACTIVE_CONTEXT: SIGNAL_LIFECYCLE_STATUS.ACTIVE,
  ACTIVE: SIGNAL_LIFECYCLE_STATUS.ACTIVE,
  APPROVED: SIGNAL_LIFECYCLE_STATUS.ACTIVE,
  PENDING: SIGNAL_LIFECYCLE_STATUS.AUDIT,
  REMOVED: SIGNAL_LIFECYCLE_STATUS.AUDIT,
  DISMISSED: SIGNAL_LIFECYCLE_STATUS.AUDIT,
};

function normalizeLifecycleToken(raw: unknown): SignalLifecycleStatus | undefined {
  if (typeof raw !== "string") return undefined;
  const key = raw.trim().toUpperCase().replace(/-/g, "_");
  return LEGACY_STATUS_MAP[key];
}

/**
 * Read lifecycle from queue item top-level `status` (canonical).
 * Falls back to metadata.status for rows not yet backfilled by migration.
 */
export function readSignalLifecycleStatus(
  item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">,
): SignalLifecycleStatus | undefined {
  if (item.type !== "competitor_strength") return undefined;

  if (isSignalLifecycleStatus(item.status)) return item.status;

  const meta = item.metadata ?? {};
  const fromMeta = normalizeLifecycleToken(meta.status);
  if (fromMeta) return fromMeta;

  const fromAudit = normalizeLifecycleToken(meta.audit_status);
  if (fromAudit) return fromAudit;

  if (meta.move_to_active_context === true) {
    return SIGNAL_LIFECYCLE_STATUS.ACTIVE;
  }

  return undefined;
}

export function isActiveSignal(item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">): boolean {
  return item.type === "competitor_strength" && item.status === SIGNAL_LIFECYCLE_STATUS.ACTIVE;
}

export function isAuditSignal(item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">): boolean {
  return item.type === "competitor_strength" && item.status === SIGNAL_LIFECYCLE_STATUS.AUDIT;
}

export function isDiscoverySignal(
  item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">,
): boolean {
  return item.type === "competitor_strength" && item.status === SIGNAL_LIFECYCLE_STATUS.DISCOVERY;
}

/** Strip legacy toggles — lifecycle is top-level `status` only. */
export function stripLegacyLifecycleMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!metadata) return {};
  const next = { ...metadata };
  delete next.status;
  delete next.move_to_active_context;
  delete next.audit_status;
  return next;
}

export function applySignalLifecycleStatus(
  item: OptimizationQueueItem,
  status: SignalLifecycleStatus,
): OptimizationQueueItem {
  return {
    ...item,
    status,
    metadata: stripLegacyLifecycleMetadata(item.metadata),
  };
}

export function filterActiveSignals(items: OptimizationQueueItem[]): OptimizationQueueItem[] {
  return items.filter(isActiveSignal);
}

export function filterAuditSignals(items: OptimizationQueueItem[]): OptimizationQueueItem[] {
  return items.filter(isAuditSignal);
}
