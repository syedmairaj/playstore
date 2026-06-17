/**
 * Optimizer Synchronization Hook
 *
 * Provides real-time synchronization between Staging Vault and AI Listing Optimizer
 * using React Query for automatic revalidation on staging events.
 */

import { useQuery, useQueryClient, keepPreviousData, type QueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";
import {
  isActiveContextReconnecting,
  networkQueryRetryOptions,
} from "@/lib/client/query-network-retry";
import {
  fetchOptimizerContext,
} from "@/lib/client/workspace-query-fetchers";
import {
  groupKeywordSignals,
  type GroupedKeywordSignals,
  type KeywordSignal,
} from "@/lib/staging/keyword-signals";

export interface OptimizerContext {
  activeItems: Array<{
    id: string;
    signalType: string;
    content: string;
    source: string;
    sourceContext?: string;
    sourceContextId?: string;
    stagedAt: string;
    metadata: Record<string, unknown>;
  }>;
  archivedItems: Array<{
    id: string;
    signalType: string;
    archivedAt: string;
    archivedReason: string;
  }>;
  stats: {
    totalStaged: number;
    totalArchived: number;
    lastSyncAt: string;
  };
}

export interface KeywordSignalsResponse {
  ok: boolean;
  signals: KeywordSignal[];
  grouped: GroupedKeywordSignals;
  total: number;
  locale: "en" | "ar";
}

export type VaultLocale = "en" | "ar";

export interface UseOptimizerSyncOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  onError?: (error: Error) => void;
  /** When set, keyword signals are fetched for this app. */
  appId?: string;
  /** Vault branch: state_en or state_ar (matches route locale). */
  vaultLocale?: VaultLocale;
}

export const OPTIMIZER_CONTEXT_KEY = (
  workspaceId: string,
  vaultLocale: VaultLocale = "en"
) => ["optimizer-context", workspaceId, vaultLocale] as const;

export const KEYWORD_SIGNALS_KEY = (
  workspaceId: string,
  appId: string,
  vaultLocale: VaultLocale = "en"
) => ["keyword-signals", workspaceId, appId, vaultLocale] as const;

async function fetchKeywordSignals(
  workspaceId: string,
  appId: string,
  vaultLocale: VaultLocale
): Promise<KeywordSignalsResponse> {
  let res: Response;
  try {
    res = await fetch(
      `/api/workspaces/${workspaceId}/staging-vault/keyword-signals?appId=${encodeURIComponent(appId)}&locale=${vaultLocale}`,
      { credentials: "include" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`ERR_NETWORK_CHANGED: ${message}`);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch keyword signals: ${res.status}`);
  }
  return res.json();
}

/** Optimistically patch keyword signals cache (instant Active Context update). */
export function patchKeywordSignalsCache(
  queryClient: QueryClient,
  workspaceId: string,
  appId: string,
  updater: (prev: KeywordSignal[]) => KeywordSignal[],
  vaultLocale: VaultLocale = "en"
): void {
  const key = KEYWORD_SIGNALS_KEY(workspaceId, appId, vaultLocale);
  queryClient.setQueryData<KeywordSignalsResponse>(key, (prev) => {
    const signals = updater(prev?.signals ?? []);
    return {
      ok: true,
      signals,
      grouped: groupKeywordSignals(signals),
      total: signals.length,
      locale: vaultLocale,
    };
  });
}

/** Add or update a keyword signal in cache after staging. */
export function upsertKeywordSignalCache(
  queryClient: QueryClient,
  workspaceId: string,
  appId: string,
  signal: KeywordSignal,
  vaultLocale: VaultLocale = "en"
): void {
  patchKeywordSignalsCache(
    queryClient,
    workspaceId,
    appId,
    (prev) => {
      const filtered = prev.filter((s) => s.keyword !== signal.keyword);
      return [signal, ...filtered];
    },
    vaultLocale
  );
}

export function useKeywordSignals(
  workspaceId: string,
  appId: string | undefined,
  vaultLocale: VaultLocale = "en"
) {
  const contextCache = queryDefaultsFor("workspaceContext");

  const { data, isLoading, isFetching, error, isPending, isError, failureCount } =
    useQuery<KeywordSignalsResponse>({
      queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId ?? "", vaultLocale),
      queryFn: () => fetchKeywordSignals(workspaceId, appId!, vaultLocale),
      enabled: Boolean(workspaceId && appId),
      placeholderData: keepPreviousData,
      staleTime: contextCache.staleTime,
      gcTime: contextCache.gcTime,
      refetchOnWindowFocus: contextCache.refetchOnWindowFocus,
      refetchOnMount: true,
      structuralSharing: contextCache.structuralSharing,
      ...networkQueryRetryOptions,
    });

  const isReconnecting = isActiveContextReconnecting({
    isFetching,
    isError,
    failureCount,
    error,
    hasCachedData: Boolean(data?.signals?.length),
  });

  return {
    signals: data?.signals ?? [],
    grouped: data?.grouped,
    total: data?.total ?? 0,
    isLoading: isPending && !data,
    isFetching,
    isError,
    error,
    failureCount,
    isReconnecting,
  };
}

export function useOptimizerSync(
  workspaceId: string,
  options: UseOptimizerSyncOptions = {}
) {
  const {
    enabled = true,
    staleTime,
    gcTime,
    appId,
    vaultLocale = "en",
  } = options;

  const contextCache = queryDefaultsFor("workspaceContext");
  const resolvedStaleTime = staleTime ?? contextCache.staleTime;
  const resolvedGcTime = gcTime ?? contextCache.gcTime;

  const queryClient = useQueryClient();

  const queryKey = useMemo(
    () => OPTIMIZER_CONTEXT_KEY(workspaceId, vaultLocale),
    [workspaceId, vaultLocale],
  );

  const { data, error, isPending, isFetching, isError, failureCount } =
    useQuery<OptimizerContext>({
      queryKey,
      queryFn: () => fetchOptimizerContext(workspaceId, vaultLocale, appId),
      enabled: enabled && Boolean(workspaceId),
      placeholderData: keepPreviousData,
      staleTime: resolvedStaleTime,
      gcTime: resolvedGcTime,
      refetchOnWindowFocus: contextCache.refetchOnWindowFocus,
      refetchOnMount: true,
      structuralSharing: contextCache.structuralSharing,
      ...networkQueryRetryOptions,
    });

  const keywordSignals = useKeywordSignals(workspaceId, appId, vaultLocale);

  const isReconnecting = useMemo(
    () =>
      isActiveContextReconnecting({
        isFetching,
        isError,
        failureCount,
        error,
        hasCachedData: Boolean(data?.activeItems?.length),
      }) ||
      keywordSignals.isReconnecting,
    [
      data?.activeItems?.length,
      error,
      failureCount,
      isError,
      isFetching,
      keywordSignals.isReconnecting,
    ],
  );

  const mutate = useCallback(async () => {
    const tasks = [
      queryClient.invalidateQueries({
        queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, vaultLocale),
      }),
    ];
    if (appId) {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId, vaultLocale),
        })
      );
    }
    await Promise.all(tasks);
  }, [queryClient, workspaceId, appId, vaultLocale]);

  return {
    data,
    activeItems: data?.activeItems || [],
    archivedItems: data?.archivedItems || [],
    stats: data?.stats,

    keywordSignals: keywordSignals.signals,
    keywordSignalsGrouped: keywordSignals.grouped,
    keywordSignalsTotal: keywordSignals.total,
    keywordSignalsLoading: keywordSignals.isLoading,

    isLoading: isPending && !data,
    isFetching,
    isError: isError || keywordSignals.isError,
    error: error ?? keywordSignals.error,
    failureCount: Math.max(failureCount, keywordSignals.failureCount),
    isReconnecting,

    mutate,
  };
}
