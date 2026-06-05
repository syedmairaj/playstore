/**
 * Optimizer Synchronization Hook
 *
 * Provides real-time synchronization between Staging Vault and AI Listing Optimizer
 * using SWR pattern for automatic revalidation on staging events.
 *
 * Usage:
 * ```typescript
 * const { mutate, data, isLoading } = useOptimizerSync(workspaceId);
 *
 * // In stage button onStageSuccess callback:
 * await mutate(); // Revalidate optimizer context
 * ```
 */

import { useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

export interface OptimizerContext {
  activeItems: Array<{
    id: string;
    signalType: string;
    content: string;
    source: string;
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
  enabled?: boolean; // Whether to automatically fetch
  pollInterval?: number; // Poll interval in ms (0 = disabled)
  revalidateOnFocus?: boolean;
  dedupingInterval?: number;
  onError?: (error: Error) => void;
}

const fetcher = async (url: string): Promise<OptimizerContext> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch optimizer context: ${response.status}`);
  }
  return response.json();
};

export function useOptimizerSync(
  workspaceId: string,
  options: UseOptimizerSyncOptions = {}
) {
  const {
    enabled = true,
    pollInterval = 5000, // Poll every 5 seconds
    revalidateOnFocus = true,
    dedupingInterval = 2000,
    onError,
  } = options;

  const swrKey = enabled ? `/api/workspaces/${workspaceId}/optimizer/context` : null;

  const { data, error, isLoading, mutate } = useSWR<OptimizerContext>(
    swrKey,
    fetcher,
    {
      revalidateOnFocus,
      revalidateOnReconnect: true,
      dedupingInterval,
      focusThrottleInterval: pollInterval,
      // Only poll if explicitly enabled
      refreshInterval: pollInterval > 0 ? pollInterval : 0,
      onError: (error) => {
        console.error("[useOptimizerSync] Error:", error);
        onError?.(error);
      },
    }
  );

  // Manual revalidation trigger (for explicit staging events)
  const manualMutate = useCallback(async () => {
    if (!swrKey) return;

    try {
      // Perform the mutation
      await mutate();

      // Also trigger an API sync call to ensure backend consistency
      await fetch(`/api/workspaces/${workspaceId}/optimizer/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
    } catch (syncError) {
      console.error("[useOptimizerSync] Manual sync failed:", syncError);
      throw syncError;
    }
  }, [workspaceId, mutate, swrKey]);

  // Debounce rapid mutations
  const mutationQueueRef = useRef<NodeJS.Timeout>();

  const debouncedMutate = useCallback(async () => {
    if (mutationQueueRef.current) {
      clearTimeout(mutationQueueRef.current);
    }

    return new Promise<void>((resolve) => {
      mutationQueueRef.current = setTimeout(async () => {
        try {
          await manualMutate();
          resolve();
        } catch (error) {
          console.error("[useOptimizerSync] Debounced mutation failed:", error);
          resolve(); // Don't reject to prevent breaking the caller
        }
      }, 300); // 300ms debounce
    });
  }, [manualMutate]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mutationQueueRef.current) {
        clearTimeout(mutationQueueRef.current);
      }
    };
  }, []);

  return {
    // Data
    context: data,
    activeItems: data?.activeItems || [],
    archivedItems: data?.archivedItems || [],
    stats: data?.stats,

    // State
    isLoading,
    isError: !!error,
    error,

    // Methods
    mutate: debouncedMutate, // Use debounced for auto-archive callbacks
    mutateImmediate: manualMutate, // Use immediate for manual refreshes
    refresh: () => mutate(), // Alias for clarity
  };
}

/**
 * Hook for listening to specific staging events and reacting
 */
export function useStagingListener(
  workspaceId: string,
  onStaged?: (item: OptimizerContext["activeItems"][0]) => void,
  onArchived?: (item: OptimizerContext["archivedItems"][0]) => void
) {
  const { context } = useOptimizerSync(workspaceId);
  const previousContext = useRef<OptimizerContext>();

  useEffect(() => {
    if (!context || !previousContext.current) {
      previousContext.current = context;
      return;
    }

    // Check for newly staged items
    const newStagedItems = context.activeItems.filter(
      (item) =>
        !previousContext.current!.activeItems.some((prev) => prev.id === item.id)
    );

    newStagedItems.forEach((item) => {
      onStaged?.(item);
    });

    // Check for newly archived items
    const newArchivedItems = context.archivedItems.filter(
      (item) =>
        !previousContext.current!.archivedItems.some((prev) => prev.id === item.id)
    );

    newArchivedItems.forEach((item) => {
      onArchived?.(item);
    });

    previousContext.current = context;
  }, [context, onStaged, onArchived]);
}

/**
 * Custom fetcher with retry logic
 */
export const optimizerFetcher = async (
  url: string,
  options: { retries?: number; timeout?: number } = {}
) => {
  const { retries = 3, timeout = 5000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 100)
        );
      }
    }
  }

  throw lastError;
};
