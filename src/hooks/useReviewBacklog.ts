"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUERY_GC_TIME } from "@/lib/client/query-cache-policy";

export type ReviewBacklogItem = {
  id: string;
  packageName: string;
  countryCode: string;
  issueTitle: string;
  issueDescription: string;
  severity: "CRITICAL" | "MEDIUM" | "LOW";
  impact: number;
  isImplemented: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: {
    competitor_name?: string | null;
    staged_at?: string;
    original_impact_score?: number;
    quote?: string;
    archive_reason?: string;
    source_type?: string;
    review_id?: string;
    archived_at?: string;
    queue_index?: number;
  };
};

export const REVIEW_BACKLOG_KEY = (workspaceId: string) =>
  ["review-backlog", workspaceId] as const;

async function fetchReviewBacklog(workspaceId: string): Promise<ReviewBacklogItem[]> {
  const res = await fetch(`/api/workspaces/${workspaceId}/backlog`, {
    credentials: "same-origin",
  });
  const json = (await res.json()) as {
    success: boolean;
    items?: Array<{
      id: string;
      package_name: string;
      country_code: string;
      issue_title: string;
      issue_description: string;
      severity: "CRITICAL" | "MEDIUM" | "LOW";
      impact: number;
      is_implemented: boolean;
      metadata?: ReviewBacklogItem["metadata"];
      created_at: string;
      updated_at: string;
    }>;
  };

  if (!json.success) {
    throw new Error("Failed to load review backlog");
  }

  return (json.items ?? [])
    .filter((item) => item.is_implemented)
    .map((item) => ({
      id: item.id,
      packageName: item.package_name,
      countryCode: item.country_code,
      issueTitle: item.issue_title,
      issueDescription: item.issue_description,
      severity: item.severity,
      impact: item.impact,
      isImplemented: item.is_implemented,
      metadata: item.metadata,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
}

export function useReviewBacklog(workspaceId: string) {
  const queryClient = useQueryClient();
  const key = REVIEW_BACKLOG_KEY(workspaceId);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchReviewBacklog(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    gcTime: QUERY_GC_TIME.default,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const removeItem = useCallback(
    (itemId: string) => {
      queryClient.setQueryData<ReviewBacklogItem[]>(key, (prev) =>
        (prev ?? []).filter((item) => item.id !== itemId),
      );
    },
    [queryClient, key],
  );

  const restoreItem = useCallback(
    (item: ReviewBacklogItem) => {
      queryClient.setQueryData<ReviewBacklogItem[]>(key, (prev) => {
        const list = prev ?? [];
        if (list.some((row) => row.id === item.id)) return list;
        return [item, ...list];
      });
    },
    [queryClient, key],
  );

  const refetchQuiet = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    items: query.data ?? [],
    isLoading: query.isPending && !query.data,
    isError: query.isError,
    removeItem,
    restoreItem,
    refetch: refetchQuiet,
  };
}
