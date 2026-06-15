import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
  OptimizationQueueLocale,
  OptimizationQueueStats,
} from "@/lib/optimization-queue";
import { diffQueueInputs } from "@/lib/optimization-queue/queue-routing";
import { buildQueueDeltaFromResponse } from "@/lib/client/active-context-delta";
import { dispatchStagingVaultDelta } from "@/lib/client/staging-vault-sync";

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
  const res = await fetch(
    `/api/workspaces/${workspaceId}/optimization-queue?${params.toString()}`,
  );
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

/** Map competitor spy keyword payloads → queue inputs. */
export function competitorKeywordsToQueueInputs(
  keywords: Array<{ term: string; category: string }>,
  competitorName: string,
  competitorId: string,
): AddOptimizationQueueInput[] {
  return keywords.map((kw) => ({
    type: "keyword_gap" as const,
    category: "opportunity" as const,
    content: kw.term.trim(),
    source: "competitor_spy" as const,
    sourceContext: competitorName,
    sourceContextId: competitorId,
    metadata: {
      category: "opportunity",
      source_origin: "competitor_spy",
      competitor_gap_category: kw.category,
      competitor_name: competitorName,
      from_keyword_curation: true,
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
      type: "keyword_gap" as const,
      category: "opportunity" as const,
      content,
      source: "competitor_spy" as const,
      sourceContext: competitorName,
      sourceContextId: competitorId,
      metadata: { category: "opportunity", source_origin: "competitor_spy", from_gap_analysis: true },
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
      sourceContext: args.competitorName,
      sourceContextId: args.competitorId,
      metadata: {
        category: "review",
        source_origin: "competitor_spy",
        from_review_insights: true,
        signal_kind: "pain_point",
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

  for (const kw of args.keywords ?? []) {
    const term = kw.trim();
    if (!term) continue;
    items.push({
      type: "keyword_gap",
      category: "opportunity",
      content: term,
      source: "competitor_spy",
      sourceContext: args.competitorName,
      sourceContextId: args.competitorId,
      metadata: {
        category: "opportunity",
        source_origin: "competitor_spy",
        from_review_insights: true,
      },
    });
  }

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
