/**
 * Staging Vault Preview Component
 *
 * Dashboard widget showing:
 * - Count of staged signals by type
 * - Recent signals preview
 * - "Generate Now" button
 * - Language/RTL breakdown
 *
 * Used in: Dashboard, Optimizer page header
 */

"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/useToast";

interface VaultSignal {
  id: string;
  content: string;
  signal_type: "keyword" | "review_issue" | "competitor_weakness" | "optimization_insight";
  language: string;
  is_rtl: boolean;
  created_at: string;
}

interface VaultStats {
  keywords: number;
  reviewIssues: number;
  competitorWeaknesses: number;
  optimizationInsights: number;
  total: number;
  languages: Record<string, number>;
}

interface Props {
  workspaceId: string;
  appId: string;
  onGenerateClick?: () => void;
}

export function StagingVaultPreview({
  workspaceId,
  appId,
  onGenerateClick,
}: Props) {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [signals, setSignals] = useState<VaultSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    loadVaultData();
    // Poll every 30 seconds for updates
    const interval = setInterval(loadVaultData, 30000);
    return () => clearInterval(interval);
  }, [workspaceId, appId]);

  const loadVaultData = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/list?appId=${appId}&limit=5`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error("Failed to load vault data");
      }

      const data = await response.json();

      // Calculate stats
      const stats: VaultStats = {
        keywords: data.keywords?.length || 0,
        reviewIssues: data.reviewIssues?.length || 0,
        competitorWeaknesses: data.competitorWeaknesses?.length || 0,
        optimizationInsights: data.optimizationInsights?.length || 0,
        total: data.total || 0,
        languages: {},
      };

      // Build language breakdown
      [
        ...(data.keywords || []),
        ...(data.reviewIssues || []),
        ...(data.competitorWeaknesses || []),
        ...(data.optimizationInsights || []),
      ].forEach((signal: any) => {
        stats.languages[signal.language] =
          (stats.languages[signal.language] || 0) + 1;
      });

      setStats(stats);
      setSignals(data.keywords || []);
      setError(null);
    } catch (err) {
      console.error("[VaultPreview] Load error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load vault signals"
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 rounded-lg border border-red-200 p-4">
        <p className="text-sm text-red-700">{error || "Failed to load vault"}</p>
        <button
          onClick={loadVaultData}
          className="mt-2 text-sm text-red-700 underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Staging Vault</h3>
        {stats.total > 0 && (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
            {stats.total} signal{stats.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {stats.total === 0 ? (
        <p className="text-sm text-gray-500">
          No staged signals yet. Start staging from Keyword Tracker, Alerts, or
          Competitor Spy.
        </p>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {stats.keywords > 0 && (
              <div className="bg-blue-50 rounded p-2">
                <p className="text-xs text-blue-600 font-medium">Keywords</p>
                <p className="text-lg font-bold text-blue-900">
                  {stats.keywords}
                </p>
              </div>
            )}
            {stats.reviewIssues > 0 && (
              <div className="bg-red-50 rounded p-2">
                <p className="text-xs text-red-600 font-medium">Issues</p>
                <p className="text-lg font-bold text-red-900">
                  {stats.reviewIssues}
                </p>
              </div>
            )}
            {stats.competitorWeaknesses > 0 && (
              <div className="bg-yellow-50 rounded p-2">
                <p className="text-xs text-yellow-600 font-medium">
                  Competitor Gaps
                </p>
                <p className="text-lg font-bold text-yellow-900">
                  {stats.competitorWeaknesses}
                </p>
              </div>
            )}
            {stats.optimizationInsights > 0 && (
              <div className="bg-green-50 rounded p-2">
                <p className="text-xs text-green-600 font-medium">Insights</p>
                <p className="text-lg font-bold text-green-900">
                  {stats.optimizationInsights}
                </p>
              </div>
            )}
          </div>

          {/* Language Breakdown */}
          {Object.keys(stats.languages).length > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-200">
              <p className="text-xs text-gray-600 font-medium mb-2">
                Languages
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.languages).map(([lang, count]) => (
                  <span
                    key={lang}
                    className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-xs text-gray-700"
                  >
                    {lang.toUpperCase()} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recent Signals Preview */}
          {signals.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-600 font-medium mb-2">
                Recent Keywords
              </p>
              <ul className="space-y-2">
                {signals.slice(0, 3).map((signal) => (
                  <li
                    key={signal.id}
                    className="text-sm text-gray-700 p-2 bg-gray-50 rounded line-clamp-2"
                    dir={signal.is_rtl ? "rtl" : "ltr"}
                    lang={signal.language}
                  >
                    "{signal.content}"
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={() => {
              onGenerateClick?.();
              showToast({
                type: "info",
                title: "Generating",
                message: "Optimizer will use these signals as mandatory constraints...",
                duration: 3000,
              });
            }}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-sm transition-colors"
          >
            Generate Listing
          </button>
        </>
      )}

      {/* Refresh Indicator */}
      <button
        onClick={loadVaultData}
        className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700 py-1"
        disabled={loading}
      >
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </div>
  );
}
