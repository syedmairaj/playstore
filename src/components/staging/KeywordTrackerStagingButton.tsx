/**
 * Keyword Tracker → Staging Vault Button Component
 *
 * Used in: Keyword Tracker page, next to each tracked keyword
 * Behavior: POST to staging/add with keyword metadata, show success toast
 */

"use client";

import { useState } from "react";
import { useToast } from "@/hooks/useToast";
import { TrackedKeyword } from "@/lib/staging-vault/keyword-tracker-staging";

interface Props {
  workspaceId: string;
  appId: string;
  keyword: TrackedKeyword;
  onStaged?: (keywordId: string) => void;
}

export function KeywordTrackerStagingButton({
  workspaceId,
  appId,
  keyword,
  onStaged,
}: Props) {
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  const handleStageKeyword = async () => {
    if (loading) return;

    setLoading(true);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/staging/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalType: "keyword",
            content: keyword.keyword,
            source: "keyword_tracker",
            sourceAppId: appId,
            sourceContext: "keyword_tracker",
            sourceContextId: keyword.id,
            language: keyword.language || keyword.locale.split("-")[0],
            metadata: {
              countryCode: keyword.countryCode,
              currentRank: keyword.currentRank,
              previousRank: keyword.previousRank,
              searchVolume: keyword.searchVolume,
              difficulty: keyword.difficulty,
              trend: keyword.trend,
              locale: keyword.locale,
              lastUpdated: keyword.lastUpdated,
            },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to stage keyword: ${response.status}`);
      }

      const data = await response.json();

      showToast({
        type: "success",
        title: "Keyword Staged",
        message: `"${keyword.keyword}" (${keyword.countryCode}, Rank #${keyword.currentRank})`,
        duration: 3000,
      });

      onStaged?.(keyword.id);
    } catch (error) {
      console.error("[KeywordStaging] Error:", error);
      showToast({
        type: "error",
        title: "Failed to Stage",
        message:
          error instanceof Error
            ? error.message
            : "Could not stage keyword. Try again.",
        duration: 4000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleStageKeyword}
      disabled={loading}
      className="px-3 py-1.5 text-sm font-medium rounded bg-blue-50 hover:bg-blue-100 text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={`Stage "${keyword.keyword}" to optimizer vault`}
    >
      {loading ? "Staging..." : "Stage"}
    </button>
  );
}
