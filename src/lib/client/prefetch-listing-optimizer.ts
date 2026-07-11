/**
 * Prefetch bundle for AI Listing Optimizer navigation (hover + layout warm-up).
 * Does not change queryKeys or invalidation — prefetch only.
 */

import type { QueryClient } from "@tanstack/react-query";
import { appLimitsQueryKey, workspaceAppsQueryKey } from "@/hooks/use-app-limits";
import { OPTIMIZER_CONTEXT_KEY, KEYWORD_SIGNALS_KEY } from "@/hooks/useOptimizerSync";
import { REVIEW_ACTIVE_CONTEXT_KEY } from "@/hooks/useReviewActiveContext";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  OPTIMIZATION_QUEUE_KEY,
  fetchOptimizationQueue,
} from "@/lib/client/optimization-queue-client";
import { queryDefaultsFor } from "@/lib/client/query-cache-policy";
import { fetchReviewCurationInsights } from "@/lib/client/review-derived-insights-client";
import {
  fetchOptimizerContext,
  fetchWorkspaceAppLimits,
  fetchWorkspaceApps,
} from "@/lib/client/workspace-query-fetchers";

export type VaultLocale = "en" | "ar";

export const REVIEW_DERIVED_INSIGHTS_KEY = (
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string | null,
) => ["review-derived-insights", workspaceId, locale, appId ?? null] as const;

type PrefetchListingOptimizerOptions = {
  workspaceId: string;
  vaultLocale: VaultLocale;
  /** When known (e.g. from session); otherwise prefetches workspace-wide keys. */
  appId?: string;
};

/**
 * Warms all critical Listing Optimizer + Active Context caches.
 * Safe to call on sidebar hover — deduped by React Query.
 */
export function prefetchListingOptimizerQueries(
  queryClient: QueryClient,
  options: PrefetchListingOptimizerOptions,
): void {
  const { workspaceId, vaultLocale, appId } = options;
  const metaDefaults = queryDefaultsFor("workspaceMeta", { reconcileOnMount: true });
  const contextDefaults = queryDefaultsFor("workspaceContext");
  const activeDefaults = queryDefaultsFor("activeContext");
  const reviewDefaults = queryDefaultsFor("reviewInsights");

  void queryClient.prefetchQuery({
    queryKey: workspaceAppsQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceApps(workspaceId),
    ...metaDefaults,
  });

  void queryClient.prefetchQuery({
    queryKey: appLimitsQueryKey(workspaceId),
    queryFn: () => fetchWorkspaceAppLimits(workspaceId),
    ...metaDefaults,
  });

  void queryClient.prefetchQuery({
    queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, vaultLocale, appId),
    queryFn: () => fetchOptimizerContext(workspaceId, vaultLocale, appId),
    ...contextDefaults,
  });

  void queryClient.prefetchQuery({
    queryKey: OPTIMIZATION_QUEUE_KEY(workspaceId, vaultLocale, appId),
    queryFn: () => fetchOptimizationQueue(workspaceId, vaultLocale, appId),
    ...activeDefaults,
  });

  void queryClient.prefetchQuery({
    queryKey: REVIEW_ACTIVE_CONTEXT_KEY(workspaceId, vaultLocale, appId),
    queryFn: async () => {
      const res = await fetchOptimizationQueue(workspaceId, vaultLocale, appId);
      const reviewItems = res.items.filter((item) => {
        if (item.type !== "review_pain_point") return false;
        const meta = item.metadata ?? {};
        return (
          meta.explicitly_staged === true ||
          meta.move_to_active_context === true ||
          typeof meta.review_id === "string" ||
          meta.archive_reason === "active"
        );
      });
      return {
        items: reviewItems,
        titles: reviewItems.map((i) => i.content.trim()),
        reviewIds: reviewItems
          .map((i) => i.metadata.review_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      };
    },
    ...activeDefaults,
  });

  void queryClient.prefetchQuery({
    queryKey: REVIEW_DERIVED_INSIGHTS_KEY(workspaceId, vaultLocale, appId ?? null),
    queryFn: () =>
      fetchReviewCurationInsights(workspaceId, {
        locale: vaultLocale,
        appId,
      }),
    ...reviewDefaults,
  });

  if (appId) {
    void queryClient.prefetchQuery({
      queryKey: KEYWORD_SIGNALS_KEY(workspaceId, appId, vaultLocale),
      queryFn: async () => {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/staging-vault/keyword-signals?appId=${encodeURIComponent(appId)}&locale=${vaultLocale}`,
        );
        if (!res.ok) {
          throw new Error(`Failed to fetch keyword signals: ${res.status}`);
        }
        return res.json();
      },
      ...contextDefaults,
    });
  }
}
