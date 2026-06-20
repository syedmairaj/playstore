import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import type {
  ClusterSynthesisPayload,
  ActiveContextSynthesisSignal,
} from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildActiveContextSynthesis } from "@/lib/optimization-queue/build-active-context-synthesis";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import { readImpactPercent } from "@/lib/review-insights/growth-strategy-tags";
import {
  resolveSourceTag,
  type ActiveContextSourceTag,
} from "@/lib/staging/optimizer-context-adapter";

/** Hard cap on signals injected into generation prompts. */
export const OPTIMIZER_CONTEXT_MAX_SIGNALS = 5;
export const CONTENT_PREVIEW_MAX_LEN = 80;

/**
 * Impact ordering for generation prompts:
 * review_analysis (highest conversion signal) > market_intel > competitor > tracker.
 */
export const SOURCE_IMPACT_PRIORITY: Record<ActiveContextSourceTag, number> = {
  review_analysis: 500,
  market_intel: 300,
  keyword_spotlight: 280,
  competitor_spy: 250,
  staging_vault: 200,
  keyword_tracker: 100,
};

export type OptimizedContextResult = {
  items: OptimizationQueueItem[];
  synthesis: ClusterSynthesisPayload;
  trackedKeywordSignals: Array<{
    keyword: string;
    confidence: number;
    difficulty?: number;
    searchVolume?: number;
    liveRankSummary?: string;
  }>;
  topStagedIssues: Array<{
    label: string;
    impactPercent?: number;
    growthStrategyTag: "product_improvement" | "oppositional_target";
  }>;
  activeSignalTypes: Array<"reviews" | "market" | "competitors" | "keywords">;
};

/** Normalized preview key for Set-based deduplication (EN/AR safe). */
export function contentPreview(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .replace(/^market_spotlight:/i, "")
    .replace(/\s+/g, " ")
    .slice(0, CONTENT_PREVIEW_MAX_LEN);
}

function metaNumber(meta: Record<string, unknown>, key: string): number | undefined {
  const v = meta[key];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function metaString(meta: Record<string, unknown>, key: string): string | undefined {
  const v = meta[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

export function resolveSignalImpactScore(
  item: Pick<OptimizationQueueItem, "source" | "sourceContext" | "metadata" | "type">,
): number {
  const sourceTag = resolveSourceTag({
    source: item.source,
    sourceContext: item.sourceContext,
    metadata: item.metadata,
  });
  const base = SOURCE_IMPACT_PRIORITY[sourceTag] ?? 50;
  const impact = readImpactPercent(item.metadata ?? {}) ?? 0;
  const conversion = metaNumber(item.metadata ?? {}, "conversion_impact_score") ?? 0;
  return base * 1_000 + impact * 10 + conversion;
}

/**
 * Deduplicate by `content_preview` — identical previews stored once (highest impact wins).
 */
export function deduplicateByContentPreview<
  T extends Pick<OptimizationQueueItem, "content" | "source" | "sourceContext" | "metadata" | "type">,
>(items: T[]): T[] {
  const seen = new Set<string>();
  const ranked = [...items].sort(
    (a, b) => resolveSignalImpactScore(b) - resolveSignalImpactScore(a),
  );
  const out: T[] = [];

  for (const item of ranked) {
    const preview = contentPreview(item.content);
    if (!preview || seen.has(preview)) continue;
    seen.add(preview);
    out.push(item);
  }

  return out;
}

/** Prioritize review_analysis, then cap to max signals (default 5). */
export function prioritizeAndLimitSignals<
  T extends Pick<OptimizationQueueItem, "content" | "source" | "sourceContext" | "metadata" | "type">,
>(items: T[], maxSignals = OPTIMIZER_CONTEXT_MAX_SIGNALS): T[] {
  return deduplicateByContentPreview(items).slice(0, maxSignals);
}

function emptySynthesis(): ClusterSynthesisPayload {
  return { offensive: [], defensive: [], market: [] };
}

function trackedFromItems(
  items: OptimizationQueueItem[],
): OptimizedContextResult["trackedKeywordSignals"] {
  const out: OptimizedContextResult["trackedKeywordSignals"] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (resolveQueueItemCategory(item) !== "tracker") continue;
    const preview = contentPreview(item.content);
    if (!preview || seen.has(preview)) continue;
    seen.add(preview);

    const meta = item.metadata ?? {};
    out.push({
      keyword: item.content.trim(),
      confidence: metaNumber(meta, "confidence") ?? 0,
      ...(metaNumber(meta, "difficulty") != null
        ? { difficulty: metaNumber(meta, "difficulty") }
        : {}),
      ...(metaNumber(meta, "searchVolume") != null
        ? { searchVolume: metaNumber(meta, "searchVolume") }
        : metaNumber(meta, "search_volume") != null
          ? { searchVolume: metaNumber(meta, "search_volume") }
          : {}),
      ...(metaString(meta, "liveRankSummary")
        ? { liveRankSummary: metaString(meta, "liveRankSummary") }
        : {}),
    });
  }

  return out.slice(0, OPTIMIZER_CONTEXT_MAX_SIGNALS);
}

function topIssuesFromItems(
  items: OptimizationQueueItem[],
): OptimizedContextResult["topStagedIssues"] {
  return items
    .filter((item) => resolveQueueItemCategory(item) === "review")
    .slice(0, 3)
    .map((item) => ({
      label: item.content.trim(),
      ...(readImpactPercent(item.metadata ?? {}) != null
        ? { impactPercent: readImpactPercent(item.metadata ?? {}) }
        : {}),
      growthStrategyTag: "product_improvement" as const,
    }));
}

function activeSignalTypesFromResult(
  items: OptimizationQueueItem[],
  synthesis: ClusterSynthesisPayload,
): OptimizedContextResult["activeSignalTypes"] {
  const types = new Set<OptimizedContextResult["activeSignalTypes"][number]>();
  if (items.some((i) => resolveQueueItemCategory(i) === "tracker")) types.add("keywords");
  if (
    synthesis.defensive.some(
      (s) => s.type === "review_pain_point" || s.type === "feature_request",
    )
  ) {
    types.add("reviews");
  }
  if (synthesis.market.length > 0) types.add("market");
  if (synthesis.offensive.length > 0 || synthesis.defensive.length > 0) {
    types.add("competitors");
  }
  return [...types];
}

function signalScore(signal: ActiveContextSynthesisSignal): number {
  const sourceTag = resolveSourceTag({
    source: signal.source ?? "",
    metadata: {},
  });
  const base = SOURCE_IMPACT_PRIORITY[sourceTag] ?? 50;
  const impact = signal.impactPercent ?? 0;
  const conversion = signal.conversionImpactScore ?? 0;
  return base * 1_000 + impact * 10 + conversion;
}

export {
  OPTIMIZER_CONTEXT_MAX_CHARS,
  pruneContext,
  pruneSynthesisToCharBudget,
} from "@/lib/optimizer/prune-context";

export function trimSynthesisPayload(
  payload: ClusterSynthesisPayload,
  maxSignals = OPTIMIZER_CONTEXT_MAX_SIGNALS,
): ClusterSynthesisPayload {
  const seen = new Set<string>();
  const merged = [
    ...payload.offensive.map((s) => ({ bucket: "offensive" as const, signal: s })),
    ...payload.defensive.map((s) => ({ bucket: "defensive" as const, signal: s })),
    ...payload.market.map((s) => ({ bucket: "market" as const, signal: s })),
  ].sort((a, b) => signalScore(b.signal) - signalScore(a.signal));

  const next = emptySynthesis();
  let count = 0;

  for (const row of merged) {
    if (count >= maxSignals) break;
    const preview = contentPreview(row.signal.label);
    if (!preview || seen.has(preview)) continue;
    seen.add(preview);
    next[row.bucket].push(row.signal);
    count += 1;
  }

  return next;
}

/**
 * Build lean optimizer context from queue items (pure — no vault I/O).
 * Used by lazy `fetchOptimizedContext` on the generate API.
 */
export function buildOptimizedContextFromItems(
  items: OptimizationQueueItem[],
  maxSignals = OPTIMIZER_CONTEXT_MAX_SIGNALS,
): OptimizedContextResult {
  const prioritized = prioritizeAndLimitSignals(items, maxSignals);
  const synthesis = trimSynthesisPayload(
    buildActiveContextSynthesis(prioritized),
    maxSignals,
  );

  return {
    items: prioritized,
    synthesis,
    trackedKeywordSignals: trackedFromItems(prioritized),
    topStagedIssues: topIssuesFromItems(prioritized),
    activeSignalTypes: activeSignalTypesFromResult(prioritized, synthesis),
  };
}

export type SignalRoutingLogPayload = {
  content_preview: string;
  source: string;
  source_tag: ActiveContextSourceTag;
  category?: string;
  type: string;
};

/**
 * Non-blocking observability only — does NOT route signals into prompts.
 * Scheduling via microtask avoids blocking the generation hot path.
 */
export function logOptimizerSignalObserved(
  item: Pick<OptimizationQueueItem, "content" | "source" | "sourceContext" | "metadata" | "type" | "category">,
): void {
  const payload: SignalRoutingLogPayload = {
    content_preview: contentPreview(item.content),
    source: item.source,
    source_tag: resolveSourceTag({
      source: item.source,
      sourceContext: item.sourceContext,
      metadata: item.metadata,
    }),
    category: item.category,
    type: item.type,
  };

  queueMicrotask(() => {
    console.info("[optimizer-context] signal observed", payload);
  });
}

/** @deprecated Use buildOptimizedContextFromItems — push routing removed. */
export function deduplicateSignalsByContent<
  T extends Pick<OptimizationQueueItem, "content" | "source" | "sourceContext" | "metadata" | "type">,
>(items: T[]): T[] {
  return deduplicateByContentPreview(items);
}
