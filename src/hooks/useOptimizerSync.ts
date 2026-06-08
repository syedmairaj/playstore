/**
 * Optimizer Synchronization Hook
 *
 * Provides real-time synchronization between Staging Vault and AI Listing Optimizer
 * using React Query for automatic revalidation on staging events.
 *
 * Usage:
 * ```typescript
 * const { data, mutate, isLoading } = useOptimizerSync(workspaceId);
 *
 * // In stage button onStageSuccess callback:
 * await mutate(); // Revalidate optimizer context
 * ```
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

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

export interface UseOptimizerSyncOptions {
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  onError?: (error: Error) => void;
}

const OPTIMIZER_CONTEXT_KEY = (workspaceId: string) => [
  "optimizer-context",
  workspaceId,
];

export function useOptimizerSync(
  workspaceId: string,
  options: UseOptimizerSyncOptions = {}
) {
  const {
    enabled = true,
    staleTime = 5000, // 5 seconds
    gcTime = 10 * 60 * 1000, // 10 minutes
    onError,
  } = options;

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<OptimizerContext>({
    queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId),
    queryFn: async () => {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/optimizer/context`
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

  // Manual refresh
  const mutate = useCallback(async () => {
    return queryClient.invalidateQueries({
      queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId),
    });
  }, [queryClient, workspaceId]);

  return {
    // Data
    data,
    activeItems: data?.activeItems || [],
    archivedItems: data?.archivedItems || [],
    stats: data?.stats,

    // State
    isLoading,
    isError: !!error,
    error,

    // Methods
    mutate, // Invalidate and refetch
  };
}
