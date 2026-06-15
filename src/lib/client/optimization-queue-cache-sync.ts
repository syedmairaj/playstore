import type { QueryClient } from "@tanstack/react-query";
import type { OptimizationQueueItem, OptimizationQueueLocale } from "@/lib/optimization-queue";
import type { OptimizationQueueResponse } from "@/lib/client/optimization-queue-client";
import {
  getOptimizationQueueStoreRegistryKeys,
  hydrateOptimizationQueueStore,
  optimizationQueueStoreKey,
  patchOptimizationQueueStore,
} from "@/lib/client/optimization-queue-store";

/** Partial React Query key — matches every appId variant for workspace + locale. */
export function optimizationQueueQueryPrefix(
  workspaceId: string,
  locale: OptimizationQueueLocale,
) {
  return ["optimization-queue", workspaceId, locale] as const;
}

function collectStoreKeysForWorkspaceLocale(
  workspaceId: string,
  locale: OptimizationQueueLocale,
): Set<string> {
  const prefix = `${workspaceId}:${locale}:`;
  const keys = new Set<string>([optimizationQueueStoreKey(workspaceId, locale)]);
  for (const key of getOptimizationQueueStoreRegistryKeys()) {
    if (key.startsWith(prefix)) keys.add(key);
  }
  return keys;
}

/** Hydrate every in-memory queue store for this workspace locale (all app scopes). */
export function hydrateAllOptimizationQueueStores(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  snapshot: Pick<OptimizationQueueResponse, "items" | "stats">,
): void {
  for (const key of collectStoreKeysForWorkspaceLocale(workspaceId, locale)) {
    hydrateOptimizationQueueStore(key, snapshot);
  }
}

/** Patch every in-memory queue store for optimistic cross-route updates. */
export function patchAllOptimizationQueueStores(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  updater: (prev: OptimizationQueueItem[]) => OptimizationQueueItem[],
): void {
  for (const key of collectStoreKeysForWorkspaceLocale(workspaceId, locale)) {
    patchOptimizationQueueStore(key, updater);
  }
}

/**
 * Keep React Query + useSyncExternalStore aligned across appId-scoped cache keys.
 * Market Intel stages without appId while Listing Optimizer reads app-scoped keys.
 */
export function syncOptimizationQueueCaches(
  queryClient: QueryClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  data: OptimizationQueueResponse,
): void {
  queryClient.setQueriesData<OptimizationQueueResponse>(
    { queryKey: optimizationQueueQueryPrefix(workspaceId, locale) },
    data,
  );
  hydrateAllOptimizationQueueStores(workspaceId, locale, data);
}
