"use client";

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue";
import { sectionDedupeKey } from "@/lib/optimization-queue/queue-routing";
import {
  OPTIMIZATION_QUEUE_KEY,
  addToOptimizationQueueClient,
  fetchOptimizationQueue,
  removeFromOptimizationQueueClient,
} from "@/lib/client/optimization-queue-client";
import {
  getOptimizationQueueSnapshot,
  hydrateOptimizationQueueStore,
  optimizationQueueStoreKey,
  optimisticallyRemoveOptimizationQueueItem,
  patchOptimizationQueueStore,
  restoreOptimizationQueueSnapshot,
  subscribeOptimizationQueue,
  type OptimizationQueueStoreSnapshot,
} from "@/lib/client/optimization-queue-store";
import {
  STAGING_VAULT_CHANGED_EVENT,
  type StagingVaultChangedDetail,
} from "@/lib/client/staging-vault-sync";
import {
  buildQueueDeltaFromResponse,
} from "@/lib/client/active-context-delta";
import { dispatchStagingVaultDelta } from "@/lib/client/staging-vault-sync";
import {
  optimizationQueueQueryPrefix,
  patchAllOptimizationQueueStores,
  syncOptimizationQueueCaches,
} from "@/lib/client/optimization-queue-cache-sync";

function buildOptimisticItems(
  prev: OptimizationQueueItem[],
  inputs: AddOptimizationQueueInput[],
  locale: OptimizationQueueLocale,
): OptimizationQueueItem[] {
  const now = new Date().toISOString();
  const seen = new Set(prev.map(sectionDedupeKey));
  const optimistic: OptimizationQueueItem[] = [];

  for (const input of inputs) {
    const content = input.content.trim();
    if (!content) continue;

    const category =
      input.category ??
      (input.metadata?.category as OptimizationQueueItem["category"] | undefined) ??
      (input.source === "keyword_tracker" || input.source === "manual"
        ? "tracker"
        : input.type === "review_pain_point" || input.type === "feature_request"
          ? "review"
          : input.type === "competitor_strength" || input.type === "competitor_weakness"
            ? "strength"
            : "opportunity");

    const candidate: OptimizationQueueItem = {
      id: `oq-opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: input.type,
      category,
      content,
      source: input.source,
      sourceContext: input.sourceContext,
      sourceContextId: input.sourceContextId,
      language: locale,
      stagedAt: now,
      metadata: {
        ...(input.metadata ?? {}),
        category,
        source_origin: input.metadata?.source_origin ?? input.source,
        optimistic: true,
      },
    };

    const key = sectionDedupeKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    optimistic.push(candidate);
  }

  return [...optimistic, ...prev];
}

export function useOptimizationQueue(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
) {
  const queryClient = useQueryClient();
  const key = OPTIMIZATION_QUEUE_KEY(workspaceId, locale, appId);
  const storeKey = optimizationQueueStoreKey(workspaceId, locale, appId);

  const { data, isFetching, error, refetch, isPending } = useQuery({
    queryKey: key,
    queryFn: () => fetchOptimizationQueue(workspaceId, locale, appId),
    enabled: Boolean(workspaceId),
    placeholderData: keepPreviousData,
    ...queryDefaultsFor("activeContext"),
  });

  useEffect(() => {
    if (!data) return;
    hydrateOptimizationQueueStore(storeKey, {
      items: data.items,
      stats: data.stats,
    });
  }, [data, storeKey]);

  useEffect(() => {
    const onVaultChanged = (event: Event) => {
      const detail = (event as CustomEvent<StagingVaultChangedDetail>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      if (detail.locale && detail.locale !== locale) return;
      void queryClient.invalidateQueries({
        queryKey: optimizationQueueQueryPrefix(workspaceId, locale),
      });
    };
    window.addEventListener(STAGING_VAULT_CHANGED_EVENT, onVaultChanged);
    return () => window.removeEventListener(STAGING_VAULT_CHANGED_EVENT, onVaultChanged);
  }, [workspaceId, locale, queryClient]);

  const storeSnapshot = useSyncExternalStore(
    useCallback((onStoreChange) => subscribeOptimizationQueue(storeKey, onStoreChange), [storeKey]),
    () => getOptimizationQueueSnapshot(storeKey),
    () => getOptimizationQueueSnapshot(storeKey),
  );

  const items =
    storeSnapshot.version > 0 ? storeSnapshot.items : (data?.items ?? storeSnapshot.items);

  const addItems = useCallback(
    async (inputs: AddOptimizationQueueInput[]) => {
      const previousSnapshot: OptimizationQueueStoreSnapshot =
        getOptimizationQueueSnapshot(storeKey);
      const previousQuery = queryClient.getQueryData<typeof data>(key);

      patchAllOptimizationQueueStores(workspaceId, locale, (prev) =>
        buildOptimisticItems(prev, inputs, locale),
      );

      queryClient.setQueriesData(
        { queryKey: optimizationQueueQueryPrefix(workspaceId, locale) },
        (prev: typeof data | undefined) => {
          if (!prev) {
            return {
              items: buildOptimisticItems([], inputs, locale),
              stats: {
                total: inputs.length,
                byType: {} as never,
                lastSyncAt: new Date().toISOString(),
              },
            };
          }
          return {
            ...prev,
            items: buildOptimisticItems(prev.items, inputs, locale),
          };
        },
      );

      try {
        const result = await addToOptimizationQueueClient(
          workspaceId,
          locale,
          inputs,
          appId,
        );

        syncOptimizationQueueCaches(queryClient, workspaceId, locale, result);

        dispatchStagingVaultDelta(
          buildQueueDeltaFromResponse({
            workspaceId,
            locale,
            appId,
            items: result.items,
            operation: "upsert",
          }),
        );

        void queryClient.invalidateQueries({
          queryKey: ["optimizer-context", workspaceId, locale],
        });

        return result;
      } catch (err) {
        hydrateOptimizationQueueStore(storeKey, {
          items: previousSnapshot.items,
          stats: previousSnapshot.stats,
        });
        if (previousQuery) {
          queryClient.setQueryData(key, previousQuery);
        } else {
          void queryClient.invalidateQueries({
            queryKey: optimizationQueueQueryPrefix(workspaceId, locale),
          });
        }

        const message = err instanceof Error ? err.message : "Failed to add to optimization queue";
        toast.error(message);
        throw err;
      }
    },
    [workspaceId, locale, appId, queryClient, key, storeKey],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const previousSnapshot: OptimizationQueueStoreSnapshot =
        getOptimizationQueueSnapshot(storeKey);
      const previousQuery = queryClient.getQueryData<typeof data>(key);

      optimisticallyRemoveOptimizationQueueItem(storeKey, itemId);

      queryClient.setQueryData(key, (prev: typeof data | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.filter((i) => i.id !== itemId),
        };
      });

      try {
        await removeFromOptimizationQueueClient(workspaceId, locale, itemId, appId);
        await queryClient.invalidateQueries({
          queryKey: optimizationQueueQueryPrefix(workspaceId, locale),
        });
        await queryClient.invalidateQueries({
          queryKey: ["optimizer-context", workspaceId, locale],
        });
      } catch (err) {
        restoreOptimizationQueueSnapshot(storeKey, {
          items: previousSnapshot.items,
          stats: previousSnapshot.stats,
        });
        if (previousQuery) {
          queryClient.setQueryData(key, previousQuery);
        } else {
          void queryClient.invalidateQueries({
            queryKey: optimizationQueueQueryPrefix(workspaceId, locale),
          });
        }
        const message = err instanceof Error ? err.message : "Failed to remove queue item";
        toast.error(message);
        throw err;
      }
    },
    [workspaceId, locale, appId, queryClient, key, storeKey],
  );

  const isQueued = useCallback(
    (type: string, content: string) => {
      const norm = content.trim().toLowerCase();
      return items.some(
        (i) => i.type === type && i.content.trim().toLowerCase() === norm,
      );
    },
    [items],
  );

  return {
    items,
    stats: storeSnapshot.stats ?? data?.stats,
    storeVersion: storeSnapshot.version,
    /** True only on first load with no cached data (not background refetch). */
    isLoading: isPending && !data,
    isFetching,
    error,
    refetch,
    addItems,
    removeItem,
    isQueued,
  };
}
