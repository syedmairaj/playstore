/**
 * React Hook: useOptimizerSync
 *
 * Manages real-time synchronization of staged signals with the AI Listing Optimizer.
 * Handles fetching, filtering, grouping, and caching of signals from the staging vault.
 *
 * Used by:
 * - ListingOptimizer component
 * - SignalFilterPanel component
 * - OptimizerDashboard component
 *
 * @example
 * const { signals, isLoading, error, refetch, signalsByContext } = useOptimizerSync("ws-123");
 *
 * return (
 *   <div>
 *     {signalsByContext.common_issues_theme.map(signal => (
 *       <SignalCard key={signal.id} signal={signal} />
 *     ))}
 *   </div>
 * );
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import type { SourceContext } from "./stageSignal";
import {
  filterSignalsBySourceContext,
  groupSignalsBySourceContext,
} from "./stageSignal";

// ── Type Definitions ──────────────────────────────────────────────────
export interface StagedSignal {
  id: string;
  workspace_id: string;
  signal_type:
    | "keyword"
    | "review_issue"
    | "competitor_weakness"
    | "optimization_insight";
  source:
    | "keyword_spotlight"
    | "keyword_tracker"
    | "review_analysis"
    | "competitor_spy"
    | "market_intelligence"
    | "manual"
    | "api";
  source_context: SourceContext;
  source_context_id: string;
  content: string;
  language: "en" | "ar";
  is_rtl: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at?: string;
}

export interface UseOptimizerSyncState {
  signals: StagedSignal[];
  isLoading: boolean;
  error: Error | null;
  lastUpdated: Date | null;
  signalsByContext: Record<SourceContext, StagedSignal[]>;
  signalCount: number;
}

export interface UseOptimizerSyncOptions {
  /** Supabase client (passed from parent component) */
  supabase?: SupabaseClient;

  /** Enable real-time subscription */
  realtime?: boolean;

  /** Polling interval in milliseconds (0 = disabled) */
  pollingInterval?: number;

  /** Filter by specific source context */
  sourceContext?: SourceContext;

  /** Auto-refetch on mount */
  autoFetch?: boolean;

  /** Cache duration in milliseconds (default: 5000) */
  cacheDuration?: number;
}

// ── Hook Implementation ───────────────────────────────────────────────
export function useOptimizerSync(
  workspaceId: string,
  options: UseOptimizerSyncOptions = {}
): UseOptimizerSyncState & {
  refetch: () => Promise<void>;
  clearCache: () => void;
} {
  const {
    supabase,
    realtime = true,
    pollingInterval = 0,
    sourceContext,
    autoFetch = true,
    cacheDuration = 5000,
  } = options;

  // ── State ─────────────────────────────────────────────────────────
  const [signals, setSignals] = useState<StagedSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ── Cache Refs ────────────────────────────────────────────────────
  const cacheRef = useRef<{
    data: StagedSignal[];
    timestamp: number;
  } | null>(null);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ── Derived State (Computed) ──────────────────────────────────────
  const signalsByContext = groupSignalsBySourceContext(signals);
  const filteredSignals = sourceContext
    ? filterSignalsBySourceContext(signals, sourceContext)
    : signals;
  const signalCount = filteredSignals.length;

  // ── Clear Cache Utility ───────────────────────────────────────────
  const clearCache = useCallback(() => {
    cacheRef.current = null;
  }, []);

  // ── Main Fetch Function ───────────────────────────────────────────
  const fetchSignals = useCallback(async () => {
    // Check cache validity
    if (cacheRef.current) {
      const now = Date.now();
      const cacheAge = now - cacheRef.current.timestamp;

      if (cacheAge < cacheDuration) {
        setSignals(cacheRef.current.data);
        return;
      }
    }

    if (!supabase) {
      console.warn("[useOptimizerSync] Supabase client not provided");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("workspace_staging_vault")
        .select(
          `
          id,
          workspace_id,
          signal_type,
          source,
          source_context,
          source_context_id,
          content,
          language,
          is_rtl,
          metadata,
          created_at,
          updated_at
        `
        )
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw new Error(`Failed to fetch signals: ${fetchError.message}`);
      }

      const typedData = (data || []) as StagedSignal[];

      // Update cache
      cacheRef.current = {
        data: typedData,
        timestamp: Date.now(),
      };

      setSignals(typedData);
      setLastUpdated(new Date());

      console.info(`[useOptimizerSync] Fetched ${typedData.length} signals`, {
        workspaceId,
        contexts: Object.keys(groupSignalsBySourceContext(typedData)),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      console.error("[useOptimizerSync] Fetch failed:", error);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, supabase, cacheDuration]);

  // ── Setup Real-time Subscription ──────────────────────────────────
  const setupRealtimeSubscription = useCallback(() => {
    if (!realtime || !supabase) return;

    console.info("[useOptimizerSync] Setting up real-time subscription");

    const channel = supabase
      .channel(`signals-${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_staging_vault",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          console.info("[useOptimizerSync] Real-time change detected, refetching");
          clearCache();
          fetchSignals();
        }
      )
      .subscribe((status) => {
        console.info(
          "[useOptimizerSync] Subscription status:",
          status
        );
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, realtime, supabase, fetchSignals, clearCache]);

  // ── Setup Polling ────────────────────────────────────────────────
  useEffect(() => {
    if (pollingInterval <= 0) return;

    console.info(
      `[useOptimizerSync] Starting polling every ${pollingInterval}ms`
    );

    pollIntervalRef.current = setInterval(() => {
      fetchSignals();
    }, pollingInterval);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [pollingInterval, fetchSignals]);

  // ── Setup Initial Data & Subscriptions ────────────────────────────
  useEffect(() => {
    if (autoFetch) {
      fetchSignals();
    }

    if (realtime) {
      unsubscribeRef.current = setupRealtimeSubscription();
    }

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [workspaceId, autoFetch, realtime, fetchSignals, setupRealtimeSubscription]);

  // ── Return State + Methods ────────────────────────────────────────
  return {
    signals: filteredSignals,
    isLoading,
    error,
    lastUpdated,
    signalsByContext,
    signalCount,
    refetch: fetchSignals,
    clearCache,
  };
}

// ── Helper Hook: Filter by Context ──────────────────────────────────
/**
 * Simplified hook for filtering signals by a single source context
 *
 * @param workspaceId - Workspace ID to fetch signals for
 * @param sourceContext - Specific context to filter by
 * @param supabase - Supabase client
 * @returns Filtered signals for the context
 *
 * @example
 * const commonIssuesSignals = useSignalsByContext("ws-123", "common_issues_theme", supabase);
 * // Only returns signals from common_issues_theme
 */
export function useSignalsByContext(
  workspaceId: string,
  sourceContext: SourceContext,
  supabase?: SupabaseClient
) {
  return useOptimizerSync(workspaceId, {
    supabase,
    sourceContext,
    pollingInterval: 10000, // Poll every 10 seconds
  });
}

// ── Helper Hook: Get Signal Count ──────────────────────────────────
/**
 * Simple hook to get count of signals per context
 *
 * @param workspaceId - Workspace ID
 * @param supabase - Supabase client
 * @returns Object with context -> count mapping
 *
 * @example
 * const counts = useSignalCounts("ws-123", supabase);
 * // { common_issues_theme: 5, keyword_spotlight: 3, ... }
 */
export function useSignalCounts(
  workspaceId: string,
  supabase?: SupabaseClient
) {
  const { signalsByContext } = useOptimizerSync(workspaceId, { supabase });

  return Object.entries(signalsByContext).reduce(
    (acc, [context, signals]) => ({
      ...acc,
      [context]: signals.length,
    }),
    {} as Record<SourceContext, number>
  );
}

/**
 * Export hook types for use in component files
 */
export type { UseOptimizerSyncState, UseOptimizerSyncOptions, StagedSignal };
