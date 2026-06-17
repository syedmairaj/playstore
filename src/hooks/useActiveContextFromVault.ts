"use client";

import { useMemo } from "react";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue";
import {
  partitionQueueForActiveContext,
  type PartitionedActiveContextQueue,
} from "@/lib/client/active-context-from-queue";
import { useOptimizationQueue } from "@/hooks/useOptimizationQueue";

export type UseActiveContextFromVaultResult = ReturnType<
  typeof useOptimizationQueue
> & {
  /** Queue rows partitioned for Active Context widgets (Review / Market / Competitor). */
  partitioned: PartitionedActiveContextQueue;
};

/**
 * Unified Active Context ingestion — single source: workspace_staging_vault
 * `state_{locale}.features.optimization_queue` via the optimization-queue API.
 */
export function useActiveContextFromVault(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
): UseActiveContextFromVaultResult {
  const queue = useOptimizationQueue(workspaceId, locale, appId);

  const partitioned = useMemo(
    () => partitionQueueForActiveContext(queue.items),
    [queue.items],
  );

  return {
    ...queue,
    partitioned,
    categorizationModal: queue.categorizationModal,
  };
}
