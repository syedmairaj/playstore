/**
 * useStagingWorkspace Hook
 *
 * Integration hook for the Staging Workspace in ListingOptimizer.
 * Manages:
 * - Building workspace state from optimizer context
 * - Handling signal removal with API sync
 * - Updating parent components
 * - Bilingual config
 */

import { useMemo, useCallback, useState, useEffect } from "react";
import type {
  StagingWorkspaceState,
  StagingWorkspaceConfig,
  ReviewIssueSignal,
  MarketOpportunitySignal,
  CompetitorKeywordSignal,
} from "@/lib/client/staging-workspace-types";
import {
  buildStagingWorkspaceState,
  calculateTotalSignalCount,
} from "@/lib/client/staging-workspace-service";

interface UseStagingWorkspaceProps {
  reviewIssues: ReviewIssueSignal[];
  marketOpportunities: MarketOpportunitySignal[];
  competitorKeywords: CompetitorKeywordSignal[];
  locale: "en" | "ar";
  isRtl: boolean;
  isLoading?: boolean;
  onRemoveSignal: (signalId: string, source: string) => Promise<void>;
  onSignalsUpdate?: (totalSignals: number) => void;
}

export function useStagingWorkspace({
  reviewIssues = [],
  marketOpportunities = [],
  competitorKeywords = [],
  locale,
  isRtl,
  isLoading = false,
  onRemoveSignal,
  onSignalsUpdate,
}: UseStagingWorkspaceProps) {
  const [error, setError] = useState<string | null>(null);

  // Combine all signals
  const allSignals = useMemo(
    () => [
      ...reviewIssues,
      ...marketOpportunities,
      ...competitorKeywords,
    ],
    [reviewIssues, marketOpportunities, competitorKeywords]
  );

  // Build workspace state
  const workspaceState = useMemo<StagingWorkspaceState>(() => {
    const state = buildStagingWorkspaceState(allSignals);
    return {
      ...state,
      isLoading,
      error: error || undefined,
    };
  }, [allSignals, isLoading, error]);

  // Build workspace config
  const workspaceConfig = useMemo<StagingWorkspaceConfig>(
    () => ({
      showEmptyPillars: true,
      enableInlineRemoval: true,
      syncToOriginModules: true,
      showSignalCounter: true,
      animateTransitions: true,
      locale,
      isRtl,
    }),
    [locale, isRtl]
  );

  // Handle signal removal
  const handleRemoveSignal = useCallback(
    async (signalId: string, source: string) => {
      setError(null);
      try {
        await onRemoveSignal(signalId, source);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to remove signal";
        setError(errorMessage);
        throw err;
      }
    },
    [onRemoveSignal]
  );

  // Notify of signal count changes
  useEffect(() => {
    onSignalsUpdate?.(workspaceState.totalSignals);
  }, [workspaceState.totalSignals, onSignalsUpdate]);

  return {
    workspaceState,
    workspaceConfig,
    handleRemoveSignal,
  };
}
