/**
 * Workspace app switch — cache invalidation, store reset, and request verification.
 * Keeps AI Listing Optimizer, Keyword Tracker, and Competitor Spy in sync per app.
 */

import type { QueryClient } from "@tanstack/react-query";
import {
  KEYWORD_SIGNALS_KEY,
  OPTIMIZER_CONTEXT_KEY,
  type VaultLocale,
} from "@/hooks/useOptimizerSync";
import { REVIEW_ACTIVE_CONTEXT_KEY } from "@/hooks/useReviewActiveContext";
import { REVIEW_DERIVED_INSIGHTS_KEY } from "@/lib/client/prefetch-listing-optimizer";
import {
  OPTIMIZATION_QUEUE_KEY,
} from "@/lib/client/optimization-queue-client";
import {
  optimizationQueueStoreKey,
  resetOptimizationQueueStore,
} from "@/lib/client/optimization-queue-store";

export const WORKSPACE_APP_CHANGED_EVENT = "playstore:workspace-app-changed";

export type WorkspaceAppChangedDetail = {
  workspaceId: string;
  previousAppId: string | null;
  nextAppId: string | null;
  locale: VaultLocale;
};

const SESSION_KEY = (workspaceId: string) =>
  `playstore:workspace-app:${workspaceId}`;

export function readPersistedWorkspaceAppId(
  workspaceId: string,
): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY(workspaceId));
    return raw?.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

export function persistWorkspaceAppId(
  workspaceId: string,
  appId: string | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!appId?.trim()) {
      sessionStorage.removeItem(SESSION_KEY(workspaceId));
      return;
    }
    sessionStorage.setItem(SESSION_KEY(workspaceId), appId.trim());
  } catch {
    // ignore quota / private mode
  }
}

/** Dev verification — logs appId on every app-scoped API call. */
export function logAppScopedRequest(
  label: string,
  workspaceId: string,
  appId?: string | null,
): void {
  if (process.env.NODE_ENV === "production") return;
  console.info(`[AppSync] API → ${label}`, {
    workspaceId,
    workspaceAppId: appId?.trim() || "(none)",
    timestamp: new Date().toISOString(),
  });
}

export type SyncAppContextOnSwitchOptions = {
  queryClient: QueryClient;
  workspaceId: string;
  locale: VaultLocale;
  previousAppId: string | null;
  nextAppId: string | null;
  onResetModuleState?: () => void;
};

/**
 * Clears stale React Query caches and in-memory optimization queue stores
 * when the selected workspace app changes.
 */
export function syncAppContextOnSwitch({
  queryClient,
  workspaceId,
  locale,
  previousAppId,
  nextAppId,
  onResetModuleState,
}: SyncAppContextOnSwitchOptions): void {
  console.info("[AppSync] workspaceAppId changed", {
    workspaceId,
    previousAppId: previousAppId ?? "(none)",
    nextAppId: nextAppId ?? "(none)",
    locale,
    timestamp: new Date().toISOString(),
  });

  if (previousAppId) {
    resetOptimizationQueueStore(
      optimizationQueueStoreKey(workspaceId, locale, previousAppId),
    );
    queryClient.removeQueries({
      queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, locale, previousAppId),
    });
    queryClient.removeQueries({
      queryKey: KEYWORD_SIGNALS_KEY(workspaceId, previousAppId, locale),
    });
    queryClient.removeQueries({
      queryKey: OPTIMIZATION_QUEUE_KEY(workspaceId, locale, previousAppId),
    });
    queryClient.removeQueries({
      queryKey: REVIEW_ACTIVE_CONTEXT_KEY(workspaceId, locale, previousAppId),
    });
    queryClient.removeQueries({
      queryKey: REVIEW_DERIVED_INSIGHTS_KEY(workspaceId, locale, previousAppId),
    });
    queryClient.removeQueries({
      queryKey: ["market-rank-wins", workspaceId, previousAppId],
    });
  }

  if (nextAppId) {
    resetOptimizationQueueStore(
      optimizationQueueStoreKey(workspaceId, locale, nextAppId),
    );
    void queryClient.invalidateQueries({
      queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, locale, nextAppId),
    });
    void queryClient.invalidateQueries({
      queryKey: KEYWORD_SIGNALS_KEY(workspaceId, nextAppId, locale),
    });
    void queryClient.invalidateQueries({
      queryKey: OPTIMIZATION_QUEUE_KEY(workspaceId, locale, nextAppId),
    });
    void queryClient.invalidateQueries({
      queryKey: REVIEW_ACTIVE_CONTEXT_KEY(workspaceId, locale, nextAppId),
    });
    void queryClient.invalidateQueries({
      queryKey: REVIEW_DERIVED_INSIGHTS_KEY(workspaceId, locale, nextAppId),
    });
    void queryClient.invalidateQueries({
      queryKey: ["market-rank-wins", workspaceId, nextAppId],
    });
  }

  onResetModuleState?.();

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<WorkspaceAppChangedDetail>(WORKSPACE_APP_CHANGED_EVENT, {
        detail: {
          workspaceId,
          previousAppId,
          nextAppId,
          locale,
        },
      }),
    );
  }
}
