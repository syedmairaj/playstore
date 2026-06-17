import type { CompetitorStrengthAuditItem } from "@/lib/competitor-spy/praise-signal-curation";

export const STRENGTH_AUDIT_UPDATED_EVENT = "competitor-strength-audit-updated";

const STORAGE_PREFIX = "playstore_strength_audit_";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type StoredAudit = {
  items: CompetitorStrengthAuditItem[];
  savedAt: number;
};

function storageKey(workspaceId: string): string {
  return `${STORAGE_PREFIX}${workspaceId}`;
}

export function readStrengthAuditQueue(
  workspaceId: string,
  competitorId?: string,
): CompetitorStrengthAuditItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(workspaceId));
    if (!raw) return [];
    const entry = JSON.parse(raw) as StoredAudit;
    if (Date.now() - entry.savedAt > TTL_MS) {
      sessionStorage.removeItem(storageKey(workspaceId));
      return [];
    }
    const items = entry.items ?? [];
    return competitorId
      ? items.filter((item) => item.competitorId === competitorId)
      : items;
  } catch {
    return [];
  }
}

export function writeStrengthAuditQueue(
  workspaceId: string,
  items: CompetitorStrengthAuditItem[],
): void {
  if (typeof window === "undefined") return;
  try {
    const entry: StoredAudit = { items, savedAt: Date.now() };
    sessionStorage.setItem(storageKey(workspaceId), JSON.stringify(entry));
    window.dispatchEvent(
      new CustomEvent(STRENGTH_AUDIT_UPDATED_EVENT, {
        detail: { workspaceId },
      }),
    );
  } catch {
    /* non-fatal */
  }
}

export function upsertStrengthAuditQueue(
  workspaceId: string,
  incoming: CompetitorStrengthAuditItem[],
  competitorId: string,
): CompetitorStrengthAuditItem[] {
  const existing = readStrengthAuditQueue(workspaceId).filter(
    (item) => item.competitorId !== competitorId,
  );
  const merged = [...existing, ...incoming];
  writeStrengthAuditQueue(workspaceId, merged);
  return merged.filter((item) => item.competitorId === competitorId);
}

export function updateStrengthAuditItem(
  workspaceId: string,
  itemId: string,
  patch: Partial<Pick<CompetitorStrengthAuditItem, "status" | "coreDifferentiator">>,
): CompetitorStrengthAuditItem | null {
  const all = readStrengthAuditQueue(workspaceId);
  let updated: CompetitorStrengthAuditItem | null = null;
  const next = all.map((item) => {
    if (item.id !== itemId) return item;
    updated = { ...item, ...patch };
    return updated;
  });
  if (!updated) return null;
  writeStrengthAuditQueue(workspaceId, next);
  return updated;
}

export function returnStrengthAuditToQueue(
  workspaceId: string,
  auditItemId: string,
): void {
  updateStrengthAuditItem(workspaceId, auditItemId, { status: "pending" });
}

export function dismissStrengthAuditByQueueItemId(
  workspaceId: string,
  queueItemId: string,
  auditItemId?: string,
): void {
  if (auditItemId) {
    dismissStrengthAuditByAuditItemId(workspaceId, auditItemId);
    return;
  }

  const all = readStrengthAuditQueue(workspaceId);
  let changed = false;
  const next = all.map((item) => {
    const linkedId =
      typeof (item as CompetitorStrengthAuditItem & { queueItemId?: string }).queueItemId ===
      "string"
        ? (item as CompetitorStrengthAuditItem & { queueItemId: string }).queueItemId
        : undefined;
    if (linkedId === queueItemId || item.id === queueItemId) {
      changed = true;
      return { ...item, status: "dismissed" as const };
    }
    return item;
  });
  if (changed) writeStrengthAuditQueue(workspaceId, next);
}

export function dismissStrengthAuditByAuditItemId(
  workspaceId: string,
  auditItemId: string,
): void {
  updateStrengthAuditItem(workspaceId, auditItemId, { status: "dismissed" });
}
