import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

/** Browser devtools audit — mirrors server Context Audit shape. */
export function logClientContextAudit(args: {
  workspaceId: string;
  appId?: string;
  queueItemCount: number;
  queueHash: string;
  vaultLocale: OptimizationQueueLocale;
  synthesis: OptimizationQueueSynthesisPayload;
}): void {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ACTIVE_CONTEXT_AUDIT !== "1") {
    return;
  }

  const { synthesis } = args;
  const snapshot = {
    source: "client-pre-generate",
    workspaceId: args.workspaceId,
    appId: args.appId,
    queueItemCount: args.queueItemCount,
    queueHash: {
      client: args.queueHash,
      vaultLocale: args.vaultLocale,
    },
    strategyMode: synthesis.strategyMode,
    activeSignalTypes: synthesis.activeSignalTypes,
    clusters: synthesis.activeContext,
    trackedKeywordSignals: synthesis.trackedKeywordSignals,
    topStagedIssues: synthesis.topStagedIssues,
    exploitTargets: synthesis.exploitTargets,
    mergedKeywords: synthesis.mergedKeywords,
    totals: {
      clusterSignals:
        synthesis.activeContext.offensive.length +
        synthesis.activeContext.defensive.length +
        synthesis.activeContext.market.length,
      trackedKeywords: synthesis.trackedKeywordSignals.length,
      queueItems: args.queueItemCount,
    },
    capturedAt: new Date().toISOString(),
  };

  console.info("[Context Audit] client → POST /api/listings/generate", snapshot);
}
