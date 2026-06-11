/**
 * Optimizer Synchronization Hook
 *
 * Provides real-time synchronization between Staging Vault and AI Listing Optimizer
 * using React Query for automatic revalidation on staging events.
 */

import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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
  const res = await fetch(
    `/api/workspaces/${workspaceId}/staging-vault/keyword-signals?appId=${encodeURIComponent(appId)}&locale=${vaultLocale}`
  );
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
  const { data, isLoading, isFetching, error } = useQuery<KeywordSignalsResponse>({
    queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId ?? "", vaultLocale),
    queryFn: () => fetchKeywordSignals(workspaceId, appId!, vaultLocale),
    enabled: Boolean(workspaceId && appId),
    staleTime: 3000,
    gcTime: 10 * 60 * 1000,
    retry: 2,
  });

  return {
    signals: data?.signals ?? [],
    grouped: data?.grouped,
    total: data?.total ?? 0,
    isLoading,
    isFetching,
    error,
  };
}

export function useOptimizerSync(
  workspaceId: string,
  options: UseOptimizerSyncOptions = {}
) {
  const {
    enabled = true,
    staleTime = 5000,
    gcTime = 10 * 60 * 1000,
    onError,
    appId,
    vaultLocale = "en",
  } = options;

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<OptimizerContext>({
    queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, vaultLocale),
    queryFn: async () => {
      const params = new URLSearchParams({ locale: vaultLocale });
      if (appId) params.set("appId", appId);
      const response = await fetch(
        `/api/workspaces/${workspaceId}/optimizer/context?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch optimizer context: ${response.status}`);
      }
      return response.json();
    },
    enabled,
    staleTime,
    gcTime,
    retry: 2,
  });

  const keywordSignals = useKeywordSignals(workspaceId, appId, vaultLocale);

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

    isLoading,
    isError: !!error,
    error,

    mutate,
  };
}
