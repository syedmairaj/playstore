/**
 * useVault Hook
 *
 * Fetches and manages staging vault data for a specific app.
 * Handles loading, error states, and auto-refresh.
 *
 * Usage:
 * const { vault, loading, error, refresh } = useVault(workspaceId, appId);
 *
 * // In template:
 * {vault?.keywords.map(kw => <span key={kw.id}>{kw.content}</span>)}
 */

import { useEffect, useState, useCallback } from "react";
import type { AppVaultContext } from "@/lib/staging-vault/staging-vault-service";

interface UseVaultOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // milliseconds (default 30000)
  onError?: (error: Error) => void;
}

export function useVault(
  workspaceId: string,
  appId: string,
  options: UseVaultOptions = {}
) {
  const { autoRefresh = true, refreshInterval = 30000, onError } = options;

  const [vault, setVault] = useState<AppVaultContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchVault = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/list?appId=${appId}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch vault: ${response.status}`);
      }

      const data: AppVaultContext = await response.json();
      setVault(data);
      setError(null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);

      // Graceful fallback: empty vault instead of blocking
      setVault({
        keywords: [],
        reviewIssues: [],
        competitorWeaknesses: [],
        optimizationInsights: [],
        total: 0,
        lastUpdated: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, appId, onError]);

  // Initial fetch
  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  // Auto-refresh interval
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchVault();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchVault]);

  return {
    vault,
    loading,
    error,
    refresh: fetchVault,
  };
}

/**
 * Helper hook: useVaultSignals
 * Returns signals grouped by type with counts
 */
export function useVaultSignals(workspaceId: string, appId: string) {
  const { vault, loading, error, refresh } = useVault(workspaceId, appId);

  return {
    keywords: vault?.keywords || [],
    reviewIssues: vault?.reviewIssues || [],
    competitorWeaknesses: vault?.competitorWeaknesses || [],
    optimizationInsights: vault?.optimizationInsights || [],
    total: vault?.total || 0,
    keywordCount: vault?.keywords.length || 0,
    issueCount: vault?.reviewIssues.length || 0,
    weaknessCount: vault?.competitorWeaknesses.length || 0,
    insightCount: vault?.optimizationInsights.length || 0,
    loading,
    error,
    refresh,
  };
}

/**
 * Helper hook: useVaultLanguages
 * Returns language breakdown (useful for RTL detection)
 */
export function useVaultLanguages(workspaceId: string, appId: string) {
  const { vault, loading } = useVault(workspaceId, appId);

  const languages: Record<string, number> = {};

  if (vault) {
    [
      ...vault.keywords,
      ...vault.reviewIssues,
      ...vault.competitorWeaknesses,
      ...vault.optimizationInsights,
    ].forEach((signal) => {
      languages[signal.language] = (languages[signal.language] || 0) + 1;
    });
  }

  const hasRtl = Object.keys(languages).some((lang) =>
    ["ar", "he", "fa", "ur"].includes(lang)
  );

  return {
    languages,
    hasRtl,
    primaryLanguage: Object.entries(languages).sort(([, a], [, b]) => b - a)[0]?.[0],
    loading,
  };
}
