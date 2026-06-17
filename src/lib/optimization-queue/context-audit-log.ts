import "server-only";

import type { ListingOptimizerRequest } from "@/lib/validation/listing-input";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";

/** Enable with ACTIVE_CONTEXT_AUDIT=1 (always on in non-production). */
export function shouldLogActiveContextAudit(): boolean {
  return (
    process.env.ACTIVE_CONTEXT_AUDIT === "1" ||
    process.env.NODE_ENV !== "production"
  );
}

export type ContextAuditSignalRow = {
  id: string;
  label: string;
  type: string;
  cluster: string;
  source?: string;
  impactPercent?: number;
  growthStrategyTag?: string;
  competitorName?: string;
  strengthClass?: string;
  coreDifferentiator?: boolean;
  conversionImpactScore?: number;
};

export type ContextAuditQueueHash = {
  client: string;
  server: string;
  validation: "matched" | "mismatch";
  vaultLocale: OptimizationQueueLocale;
  vaultItemCount: number;
};

export type ContextAuditSnapshot = {
  route: string;
  workspaceId: string;
  appId?: string;
  strategyMode?: string;
  activeSignalTypes?: string[];
  queueHash?: ContextAuditQueueHash;
  clusters: {
    offensive: ContextAuditSignalRow[];
    defensive: ContextAuditSignalRow[];
    market: ContextAuditSignalRow[];
  };
  trackedKeywordSignals: Array<{
    keyword: string;
    confidence?: number;
    difficulty?: number;
    searchVolume?: number;
    liveRankSummary?: string;
  }>;
  topStagedIssues: Array<{
    label: string;
    impactPercent?: number;
    growthStrategyTag?: string;
  }>;
  exploitTargets: string[];
  mergedKeywordCount: number;
  totals: {
    clusterSignals: number;
    trackedKeywords: number;
    topIssues: number;
    exploitTargets: number;
  };
  capturedAt: string;
  note: string;
};

function mapClusterSignals(
  signals:
    | Array<{
        id: string;
        label: string;
        type: string;
        signalCluster: string;
        source?: string;
        impactPercent?: number;
        growthStrategyTag?: string;
        competitorName?: string;
        strengthClass?: string;
        coreDifferentiator?: boolean;
        conversionImpactScore?: number;
      }>
    | undefined,
): ContextAuditSignalRow[] {
  return (signals ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    type: s.type,
    cluster: s.signalCluster,
    ...(s.source ? { source: s.source } : {}),
    ...(s.impactPercent != null ? { impactPercent: s.impactPercent } : {}),
    ...(s.growthStrategyTag ? { growthStrategyTag: s.growthStrategyTag } : {}),
    ...(s.competitorName ? { competitorName: s.competitorName } : {}),
    ...(s.strengthClass ? { strengthClass: s.strengthClass } : {}),
    ...(s.coreDifferentiator != null ? { coreDifferentiator: s.coreDifferentiator } : {}),
    ...(s.conversionImpactScore != null
      ? { conversionImpactScore: s.conversionImpactScore }
      : {}),
  }));
}

export function buildContextAuditSnapshot(args: {
  route: string;
  workspaceId: string;
  appId?: string | null;
  listing: ListingOptimizerRequest;
  activeSignalTypes?: string[];
  queueHash?: ContextAuditQueueHash;
}): ContextAuditSnapshot {
  const { listing } = args;
  const offensive = mapClusterSignals(listing.activeContext?.offensive);
  const defensive = mapClusterSignals(listing.activeContext?.defensive);
  const market = mapClusterSignals(listing.activeContext?.market);
  const trackedKeywordSignals = (listing.trackedKeywordSignals ?? []).map((s) => ({
    keyword: s.keyword,
    ...(s.confidence != null ? { confidence: s.confidence } : {}),
    ...(s.difficulty != null ? { difficulty: s.difficulty } : {}),
    ...(s.searchVolume != null ? { searchVolume: s.searchVolume } : {}),
    ...(s.liveRankSummary ? { liveRankSummary: s.liveRankSummary } : {}),
  }));

  return {
    route: args.route,
    workspaceId: args.workspaceId,
    ...(args.appId ? { appId: args.appId } : {}),
    ...(listing.strategyMode ? { strategyMode: listing.strategyMode } : {}),
    ...(args.activeSignalTypes?.length ? { activeSignalTypes: args.activeSignalTypes } : {}),
    ...(args.queueHash ? { queueHash: args.queueHash } : {}),
    clusters: { offensive, defensive, market },
    trackedKeywordSignals,
    topStagedIssues: (listing.topStagedIssues ?? []).map((i) => ({
      label: i.label,
      ...(i.impactPercent != null ? { impactPercent: i.impactPercent } : {}),
      growthStrategyTag: i.growthStrategyTag,
    })),
    exploitTargets: listing.exploitTargets ?? [],
    mergedKeywordCount: listing.targetKeywords.length,
    totals: {
      clusterSignals: offensive.length + defensive.length + market.length,
      trackedKeywords: trackedKeywordSignals.length,
      topIssues: listing.topStagedIssues?.length ?? 0,
      exploitTargets: listing.exploitTargets?.length ?? 0,
    },
    capturedAt: new Date().toISOString(),
    note: args.queueHash
      ? "Client synthesis + vault queueHash validation snapshot (pre-debit)."
      : "Client-sent synthesis snapshot at generate time.",
  };
}

export function logActiveContextAudit(snapshot: ContextAuditSnapshot): void {
  if (!shouldLogActiveContextAudit()) return;

  const hashSummary = snapshot.queueHash
    ? `queueHash ${snapshot.queueHash.validation} (client ${snapshot.queueHash.client.slice(0, 12)}… / server ${snapshot.queueHash.server.slice(0, 12)}…)`
    : "queueHash n/a";

  console.info(
    `[Context Audit] ${snapshot.route} — ${snapshot.totals.clusterSignals} cluster + ${snapshot.totals.trackedKeywords} tracker · ${hashSummary}`,
    JSON.stringify(snapshot, null, 2),
  );
}
