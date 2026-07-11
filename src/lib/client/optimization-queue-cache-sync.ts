import type { QueryClient } from "@tanstack/react-query";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import type { OptimizationQueueResponse } from "@/lib/client/optimization-queue-client";
import { OPTIMIZATION_QUEUE_KEY } from "@/lib/client/optimization-queue-client";
import {
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

/**
 * Keep React Query + useSyncExternalStore aligned for one workspace app only.
 * Never fan out queue data across other apps in the same workspace.
 */
export function syncOptimizationQueueCaches(
  queryClient: QueryClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId: string | undefined,
  data: OptimizationQueueResponse,
): void {
  const key = OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
  queryClient.setQueryData(key, data);
  hydrateOptimizationQueueStore(optimizationQueueStoreKey(workspaceId, locale, appId), {
    items: data.items,
    stats: data.stats,
  });
}

/** Optimistic patch for a single app-scoped queue store + React Query cache. */
export function patchOptimizationQueueCaches(
  queryClient: QueryClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId: string | undefined,
  updater: (
    prev: OptimizationQueueResponse["items"],
  ) => OptimizationQueueResponse["items"],
): void {
  const key = OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
  const storeKey = optimizationQueueStoreKey(workspaceId, locale, appId);
  const prevQuery = queryClient.getQueryData<OptimizationQueueResponse>(key);
  const prevItems = prevQuery?.items ?? [];
  const nextItems = updater(prevItems);

  patchOptimizationQueueStore(storeKey, () => nextItems);

  if (prevQuery) {
    queryClient.setQueryData<OptimizationQueueResponse>(key, {
      ...prevQuery,
      items: nextItems,
      stats: {
        ...prevQuery.stats,
        total: nextItems.length,
        lastSyncAt: new Date().toISOString(),
      },
    });
  }
}
