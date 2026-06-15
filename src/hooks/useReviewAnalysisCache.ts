"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_GC_TIME } from "@/lib/client/query-cache-policy";
import type { IssueItem } from "@/lib/gemini/generate-review-analysis";

export type ReviewAnalysisCacheData = {
  hasBeenAnalyzed: boolean;
  insights: IssueItem[];
  updatedAt: string | null;
};

export const REVIEW_ANALYSIS_CACHE_KEY = (
  workspaceId: string,
  packageName: string,
  countryCode: string,
  langCode: string,
) => ["review-analysis-cache", workspaceId, packageName, countryCode, langCode] as const;

/** Server competitor_insights TTL is 7 days — avoid re-probing on every tab switch. */
const CLIENT_STALE_MS = 5 * 60 * 1000;

async function probeReviewAnalysisCache(
  workspaceId: string,
  packageName: string,
  countryCode: string,
  langCode: string,
): Promise<ReviewAnalysisCacheData> {
  const url =
    `/api/workspaces/${workspaceId}/reviews/analyze` +
    `?packageName=${encodeURIComponent(packageName)}` +
    `&langCode=${encodeURIComponent(langCode)}` +
    `&country=${encodeURIComponent(countryCode)}`;

  const res = await fetch(url, { credentials: "same-origin" });
  const json = (await res.json()) as {
    success?: boolean;
    hasBeenAnalyzed?: boolean;
    insights?: IssueItem[];
    updatedAt?: string;
  };

  if (!json.success) {
    return { hasBeenAnalyzed: false, insights: [], updatedAt: null };
  }

  const analyzed = json.hasBeenAnalyzed === true;
  return {
    hasBeenAnalyzed: analyzed,
    insights: analyzed && Array.isArray(json.insights) ? json.insights : [],
    updatedAt: json.updatedAt ?? null,
  };
}

export function useReviewAnalysisCache(
  workspaceId: string,
  packageName: string,
  countryCode: string,
  langCode: string,
) {
  const queryClient = useQueryClient();
  const key = REVIEW_ANALYSIS_CACHE_KEY(workspaceId, packageName, countryCode, langCode);

  const query = useQuery({
    queryKey: key,
    queryFn: () => probeReviewAnalysisCache(workspaceId, packageName, countryCode, langCode),
    enabled: Boolean(workspaceId && packageName),
    staleTime: CLIENT_STALE_MS,
    gcTime: QUERY_GC_TIME.default,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    structuralSharing: true,
  });

  const setCache = useCallback(
    (data: ReviewAnalysisCacheData) => {
      queryClient.setQueryData(key, data);
    },
    [queryClient, key],
  );

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
  }, [queryClient, key]);

  return {
    cacheData: query.data,
    isProbeLoading: query.isPending && !query.data,
    setCache,
    invalidate,
  };
}
