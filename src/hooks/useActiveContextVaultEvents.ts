"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  applyActiveContextDelta,
  extractDeltaFromDetail,
} from "@/lib/client/active-context-delta";
import { optimizationQueueQueryPrefix } from "@/lib/client/optimization-queue-cache-sync";
import {
  STAGING_VAULT_CHANGED_EVENT,
  type StagingVaultChangedDetail,
} from "@/lib/client/staging-vault-sync";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import { OPTIMIZER_CONTEXT_KEY } from "@/hooks/useOptimizerSync";

type UseActiveContextVaultEventsOptions = {
  workspaceId: string;
  locale: OptimizationQueueLocale;
  enabled?: boolean;
  onDeltaApplied?: () => void;
  onFallbackRefresh?: () => void;
};

/**
 * Subscribe to vault producer events and delta-update Active Context
 * instead of relying on pull-only refetches.
 */
export function useActiveContextVaultEvents({
  workspaceId,
  locale,
  enabled = true,
  onDeltaApplied,
  onFallbackRefresh,
}: UseActiveContextVaultEventsOptions): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    const onVaultEvent = (event: Event) => {
      const detail = (event as CustomEvent<StagingVaultChangedDetail>).detail;
      if (!detail || detail.workspaceId !== workspaceId) return;
      if (detail.locale && detail.locale !== locale) return;

      const delta = extractDeltaFromDetail(detail);
      if (delta) {
        const applied = applyActiveContextDelta(queryClient, delta);
        if (applied) {
          onDeltaApplied?.();
          return;
        }
      }

      void queryClient.invalidateQueries({
        queryKey: optimizationQueueQueryPrefix(workspaceId, locale),
      });
      if (detail.appId) {
        void queryClient.invalidateQueries({
          queryKey: OPTIMIZER_CONTEXT_KEY(workspaceId, locale, detail.appId),
        });
      } else {
        void queryClient.invalidateQueries({
          queryKey: ["optimizer-context", workspaceId, locale],
        });
      }
      onFallbackRefresh?.();
    };

    window.addEventListener(STAGING_VAULT_CHANGED_EVENT, onVaultEvent);
    return () => window.removeEventListener(STAGING_VAULT_CHANGED_EVENT, onVaultEvent);
  }, [
    enabled,
    workspaceId,
    locale,
    queryClient,
    onDeltaApplied,
    onFallbackRefresh,
  ]);
}
