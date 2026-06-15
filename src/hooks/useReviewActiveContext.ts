"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { OptimizationQueueItem, OptimizationQueueLocale } from "@/lib/optimization-queue";
import { fetchOptimizationQueue } from "@/lib/client/optimization-queue-client";
import {
  REVIEW_INSIGHT_ARCHIVED_EVENT,
  REVIEW_INSIGHT_STAGED_EVENT,
  type ReviewInsightArchivedDetail,
  type ReviewInsightStagedDetail,
} from "@/lib/client/review-insight-staging";

export const REVIEW_ACTIVE_CONTEXT_KEY = (
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
) => ["review-active-context", workspaceId, locale, appId ?? ""] as const;

function isUserStagedReviewItem(item: OptimizationQueueItem): boolean {
  if (item.type !== "review_pain_point") return false;
  const meta = item.metadata ?? {};
  return (
    meta.explicitly_staged === true ||
    meta.move_to_active_context === true ||
    typeof meta.review_id === "string" ||
    meta.archive_reason === "active"
  );
}

export function useReviewActiveContext(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
) {
  const queryClient = useQueryClient();
  const key = REVIEW_ACTIVE_CONTEXT_KEY(workspaceId, locale, appId);

  const { data, isLoading, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await fetchOptimizationQueue(workspaceId, locale, appId);
      const reviewItems = res.items.filter(isUserStagedReviewItem);
      return {
        items: reviewItems,
        titles: reviewItems.map((i) => i.content.trim()),
        reviewIds: reviewItems
          .map((i) => i.metadata.review_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      };
    },
    enabled: Boolean(workspaceId),
    staleTime: 2000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({
      queryKey: ["optimization-queue", workspaceId, locale, appId ?? ""],
    });
  }, [queryClient, key, workspaceId, locale, appId]);

  useEffect(() => {
    const onStaged = (event: Event) => {
      const detail = (event as CustomEvent<ReviewInsightStagedDetail>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      invalidate();
    };
    const onArchived = (event: Event) => {
      const detail = (event as CustomEvent<ReviewInsightArchivedDetail>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      invalidate();
    };
    window.addEventListener(REVIEW_INSIGHT_STAGED_EVENT, onStaged);
    window.addEventListener(REVIEW_INSIGHT_ARCHIVED_EVENT, onArchived);
    return () => {
      window.removeEventListener(REVIEW_INSIGHT_STAGED_EVENT, onStaged);
      window.removeEventListener(REVIEW_INSIGHT_ARCHIVED_EVENT, onArchived);
    };
  }, [workspaceId, invalidate]);

  const activeTitles = useMemo(
    () => new Set(data?.titles ?? []),
    [data?.titles],
  );

  const activeReviewIds = useMemo(
    () => new Set(data?.reviewIds ?? []),
    [data?.reviewIds],
  );

  return {
    items: data?.items ?? [],
    activeTitles,
    activeReviewIds,
    isLoading,
    refetch,
    invalidate,
  };
}
