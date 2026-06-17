import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
  OptimizationQueueLocale,
  OptimizationQueueStats,
} from "@/lib/optimization-queue";
import { SIGNAL_LIFECYCLE_STATUS } from "@/lib/signals/signal-lifecycle";
import { diffQueueInputs } from "@/lib/optimization-queue/queue-routing";
import { buildQueueDeltaFromResponse } from "@/lib/client/active-context-delta";
import { dispatchStagingVaultDelta } from "@/lib/client/staging-vault-sync";
import { isRetryableNetworkError } from "@/lib/client/query-network-retry";

export type OptimizationQueueResponse = {
  items: OptimizationQueueItem[];
  stats: OptimizationQueueStats;
};

export const OPTIMIZATION_QUEUE_KEY = (
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
) => ["optimization-queue", workspaceId, locale, appId ?? ""] as const;

export async function fetchOptimizationQueue(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string,
): Promise<OptimizationQueueResponse> {
  const params = new URLSearchParams({ locale });
  if (appId) params.set("appId", appId);
  let res: Response;
  try {
    res = await fetch(
      `/api/workspaces/${workspaceId}/optimization-queue?${params.toString()}`,
      { credentials: "include" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isRetryableNetworkError(err)) {
      throw new Error(`ERR_NETWORK_CHANGED: ${message}`);
    }
    throw err;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch optimization queue: ${res.status}`);
  }
  return res.json();
}

export async function addToOptimizationQueueClient(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  items: AddOptimizationQueueInput[],
  appId?: string,
): Promise<OptimizationQueueResponse & { ok: boolean; addedCount: number; skippedCount?: number }> {
  const res = await fetch(`/api/workspaces/${workspaceId}/optimization-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale, appId, items }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error ?? `Failed to add to queue: ${res.status}`);
  }

  const addedItems = Array.isArray(json.items) ? json.items : [];
  dispatchStagingVaultDelta(
    buildQueueDeltaFromResponse({
      workspaceId,
      locale,
      appId,
      items: addedItems,
      operation: "upsert",
    }),
  );

  return json;
}

export async function removeFromOptimizationQueueClient(
  workspaceId: string,
  locale: OptimizationQueueLocale,
  itemId: string,
  appId?: string,
): Promise<void> {
  const params = new URLSearchParams({ locale });
  if (appId) params.set("appId", appId);
  const res = await fetch(
    `/api/workspaces/${workspaceId}/optimization-queue/${encodeURIComponent(itemId)}?${params.toString()}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error ?? `Failed to remove queue item: ${res.status}`);
  }
  dispatchStagingVaultDelta({
    operation: "remove",
    workspaceId,
    locale,
    appId,
    items: [{ id: itemId, content: "" }],
  });
}

/** Approve: AUDIT → ACTIVE */
export function marketDominatingStrengthToQueueInputs(
  items: Array<{
    term: string;
    conversionImpactScore: number;
    coreDifferentiator: boolean;
    auditItemId: string;
  }>,
  competitorName: string,
  competitorId: string,
): AddOptimizationQueueInput[] {
  return items.map((item) => ({
    type: "competitor_strength" as const,
    category: "strength" as const,
    status: SIGNAL_LIFECYCLE_STATUS.ACTIVE,
    content: item.term.trim(),
    source: "competitor_spy" as const,
    signalCluster: "OFFENSIVE_GROWTH" as const,
    sourceContext: competitorName,
    sourceContextId: competitorId,
    metadata: {
      category: "strength",
      active_context_section: "strength",
      source_origin: "competitor_spy",
      origin_module: "competitor_spy",
      competitor_name: competitorName,
      competitor_id: competitorId,
      from_strength_audit: true,
      user_selected_boolean: true,
      signal_cluster: "OFFENSIVE_GROWTH",
      cluster_category: "OFFENSIVE_GROWTH",
      strength_class: "market_dominating",
      praise_class: "market_dominating",
      core_differentiator: item.coreDifferentiator,
      conversion_impact_score: item.conversionImpactScore,
      listing_placement: "fullDescription",
      listing_placements: ["fullDescription", "whatsNew"],
      audit_item_id: item.auditItemId,
    },
  }));
}

/** Seed praise candidates into vault audit queue (AUDIT). */
export function auditQueueStrengthToQueueInputs(
  items: Array<{
    term: string;
    conversionImpactScore: number;
    auditItemId: string;
  }>,
  competitorName: string,
  competitorId: string,
): AddOptimizationQueueInput[] {
  return items.map((item) => ({
    type: "competitor_strength" as const,
    category: "strength" as const,
    status: SIGNAL_LIFECYCLE_STATUS.AUDIT,
    content: item.term.trim(),
    source: "competitor_spy" as const,
    signalCluster: "OFFENSIVE_GROWTH" as const,
    sourceContext: competitorName,
    sourceContextId: competitorId,
    metadata: {
      category: "strength",
      active_context_section: "strength",
      source_origin: "competitor_spy",
      origin_module: "competitor_spy",
      competitor_name: competitorName,
      competitor_id: competitorId,
      from_strength_audit: true,
      strength_class: "market_dominating",
      conversion_impact_score: item.conversionImpactScore,
      audit_item_id: item.auditItemId,
    },
  }));
}

/** @deprecated Legacy keyword curation — excluded from Active Context. Use marketDominatingStrengthToQueueInputs via Audit Queue. */
export function competitorKeywordsToQueueInputs(
  keywords: Array<{ term: string; category: string }>,
  competitorName: string,
  competitorId: string,
): AddOptimizationQueueInput[] {
  return keywords.map((kw) => ({
    type: "competitor_keyword" as const,
    category: "strength" as const,
    content: kw.term.trim(),
    source: "competitor_spy" as const,
    signalCluster: "OFFENSIVE_GROWTH" as const,
    sourceContext: competitorName,
    sourceContextId: competitorId,
    metadata: {
      category: "strength",
      active_context_section: "strength",
      source_origin: "competitor_spy",
      origin_module: "competitor_spy",
      competitor_gap_category: kw.category,
      competitor_name: competitorName,
      competitor_id: competitorId,
      from_keyword_curation: true,
      explicitly_staged: true,
      user_selected_boolean: true,
      signal_cluster: "OFFENSIVE_GROWTH",
      cluster_category: "OFFENSIVE_GROWTH",
    },
  }));
}

export function keywordGapsToQueueInputs(
  terms: string[],
  competitorName?: string,
  competitorId?: string,
): AddOptimizationQueueInput[] {
  return terms
    .map((term) => term.trim())
    .filter(Boolean)
    .map((content) => ({
      type: "competitor_keyword" as const,
      category: "strength" as const,
      content,
      source: "competitor_spy" as const,
      signalCluster: "OFFENSIVE_GROWTH" as const,
      sourceContext: competitorName,
      sourceContextId: competitorId,
      metadata: {
        category: "strength",
        active_context_section: "strength",
        source_origin: "competitor_spy",
        origin_module: "competitor_spy",
        signal_cluster: "OFFENSIVE_GROWTH",
        cluster_category: "OFFENSIVE_GROWTH",
        competitor_name: competitorName,
        competitor_id: competitorId,
        from_gap_analysis: true,
        explicitly_staged: true,
        user_selected_boolean: true,
      },
    }));
}

/** Map review exploit bundle → typed queue inputs. */
export function reviewExploitToQueueInputs(args: {
  keywords?: string[];
  painPoints?: string[];
  featureRequests?: string[];
  vulnerabilities?: string[];
  competitorName?: string;
  competitorId?: string;
}): AddOptimizationQueueInput[] {
  const items: AddOptimizationQueueInput[] = [];

  for (const pain of args.painPoints ?? args.vulnerabilities ?? []) {
    const term = pain.trim();
    if (!term) continue;
    items.push({
      type: "review_pain_point",
      category: "review",
      content: term,
      source: "competitor_spy",
      signalCluster: "DEFENSIVE_PAIN_POINT",
      sourceContext: args.competitorName,
      sourceContextId: args.competitorId,
      metadata: {
        category: "review",
        source_origin: "competitor_spy",
        from_review_insights: true,
        signal_kind: "pain_point",
        signal_cluster: "DEFENSIVE_PAIN_POINT",
        cluster_category: "DEFENSIVE_PAIN_POINT",
      },
    });
  }

  for (const request of args.featureRequests ?? []) {
    const term = request.trim();
    if (!term) continue;
    items.push({
      type: "feature_request",
      category: "review",
      content: term,
      source: "competitor_spy",
      sourceContext: args.competitorName,
      sourceContextId: args.competitorId,
      metadata: {
        category: "review",
        source_origin: "competitor_spy",
        from_review_insights: true,
        signal_kind: "feature_request",
      },
    });
  }

  // Praise / strengths are NOT bulk-queued — they flow through the Strength Audit Queue.
  return items;
}

/** Build + diff review insight terms against the live optimization queue (SSOT). */
export function reviewInsightsQueueDiff(
  args: Parameters<typeof reviewExploitToQueueInputs>[0],
  existing: OptimizationQueueItem[],
) {
  const inputs = reviewExploitToQueueInputs(args);
  const diff = diffQueueInputs(inputs, existing);
  return { inputs, ...diff };
}
