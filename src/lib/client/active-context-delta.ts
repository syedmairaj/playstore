import type { QueryClient } from "@tanstack/react-query";
import type { OptimizationQueueItem, OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  OPTIMIZATION_QUEUE_KEY,
  type OptimizationQueueResponse,
} from "@/lib/client/optimization-queue-client";
import { syncOptimizationQueueCaches } from "@/lib/client/optimization-queue-cache-sync";
import {
  enforceActiveContextSectionBoundary,
  type ActiveContextSection,
} from "@/lib/staging-vault/staging-vault-metadata";
import type { StagingVaultChangedDetail } from "@/lib/client/staging-vault-sync";

export type StagingVaultDeltaOperation = "upsert" | "remove" | "refresh";

export type StagingVaultDeltaItem = {
  id: string;
  content: string;
  type?: string;
  signalType?: string;
  source?: string;
  category?: ActiveContextSection;
  metadata?: Record<string, unknown>;
};

export type StagingVaultDeltaPayload = {
  operation: StagingVaultDeltaOperation;
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string;
  active_context_section?: ActiveContextSection;
  origin_module?: string;
  items?: StagingVaultDeltaItem[];
};

function toQueueItem(
  delta: StagingVaultDeltaItem,
  locale: OptimizationQueueLocale,
): OptimizationQueueItem | null {
  const content = delta.content.trim();
  if (!content) return null;

  const type = (delta.type ?? delta.signalType ?? "keyword_gap") as OptimizationQueueItem["type"];
  const section = enforceActiveContextSectionBoundary({
    signalType: delta.signalType ?? delta.type,
    source: delta.source,
    proposedSection:
      delta.category ??
      (delta.metadata?.active_context_section as ActiveContextSection | undefined) ??
      "opportunity",
    metadata: delta.metadata,
  });

  const source =
    (delta.source as OptimizationQueueItem["source"] | undefined) ??
    (delta.metadata?.origin_module as OptimizationQueueItem["source"] | undefined) ??
    "manual";

  return {
    id: delta.id,
    type,
    category: section,
    content,
    source,
    language: locale,
    stagedAt: new Date().toISOString(),
    metadata: {
      ...(delta.metadata ?? {}),
      active_context_section: section,
      category: section,
    },
  };
}

function mergeDeltaItems(
  existing: OptimizationQueueItem[],
  incoming: OptimizationQueueItem[],
): OptimizationQueueItem[] {
  const byId = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    byId.set(item.id, item);
  }
  return [...byId.values()];
}

function removeDeltaItems(
  existing: OptimizationQueueItem[],
  ids: Set<string>,
): OptimizationQueueItem[] {
  return existing.filter((item) => !ids.has(item.id));
}

/**
 * Apply a vault producer delta to Active Context caches (event-driven, no full pull).
 * Falls back to no-op when operation is refresh-only (caller should invalidate).
 */
export function applyActiveContextDelta(
  queryClient: QueryClient,
  delta: StagingVaultDeltaPayload,
): boolean {
  if (delta.operation === "refresh") return false;

  const key = OPTIMIZATION_QUEUE_KEY(
    delta.workspaceId,
    delta.locale,
    delta.appId,
  );
  const prev = queryClient.getQueryData<OptimizationQueueResponse>(key);
  if (!prev) return false;

  const incoming =
    delta.items
      ?.map((item) => toQueueItem(item, delta.locale))
      .filter((item): item is OptimizationQueueItem => item !== null) ?? [];

  if (delta.operation === "upsert" && incoming.length === 0) return false;

  const removeIds = new Set(
    delta.operation === "remove" ? incoming.map((item) => item.id) : [],
  );

  const nextItems =
    delta.operation === "remove"
      ? removeDeltaItems(prev.items, removeIds)
      : mergeDeltaItems(prev.items, incoming);

  const next: OptimizationQueueResponse = {
    items: nextItems,
    stats: {
      ...prev.stats,
      total: nextItems.length,
      lastSyncAt: new Date().toISOString(),
    },
  };
  syncOptimizationQueueCaches(
    queryClient,
    delta.workspaceId,
    delta.locale,
    delta.appId,
    next,
  );

  return true;
}

export function buildQueueDeltaFromResponse(args: {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  appId?: string;
  items: OptimizationQueueItem[];
  operation?: StagingVaultDeltaOperation;
}): StagingVaultDeltaPayload {
  return {
    operation: args.operation ?? "upsert",
    workspaceId: args.workspaceId,
    locale: args.locale,
    appId: args.appId,
    items: args.items.map((item) => ({
      id: item.id,
      content: item.content,
      type: item.type,
      source: item.source,
      category: item.category,
      metadata: item.metadata,
    })),
  };
}

export function extractDeltaFromDetail(
  detail: StagingVaultChangedDetail,
): StagingVaultDeltaPayload | null {
  return detail.delta ?? null;
}

export function patchOptimizerContextQuery(
  queryClient: QueryClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId: string | undefined,
  updater: (prev: { activeItems: unknown[] } | undefined) => { activeItems: unknown[] },
): void {
  queryClient.setQueryData(
    ["optimizer-context", workspaceId, locale, appId ?? ""],
    (prev: { activeItems: unknown[]; archivedItems?: unknown[]; stats?: unknown } | undefined) => {
      if (!prev) return prev;
      return { ...prev, ...updater(prev) };
    },
  );
}

/** Convenience: resolve queue key for a scoped appId. */
export function queueKeyForDelta(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
) {
  return OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
}
