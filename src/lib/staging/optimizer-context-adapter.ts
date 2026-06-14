/**
 * Maps universal vault JSONB (state_en / state_ar) → Active Context items.
 *
 * Curated selection model (not grab-all):
 * - Only explicitly staged / pinned signals surface in Active Context.
 * - Each signal carries a sourceTag and routes to exactly one widget.
 * - Keyword Tracker terms never duplicate into Market Opportunities.
 */

import type {
  ActiveContextSignalType,
  OptimizationQueueCategory,
  OptimizationQueueItem,
  TypedActiveContextSignal,
} from "@/lib/optimization-queue/optimization-queue.types";
import {
  ACTIVE_CONTEXT_SECTION_LABELS,
  CATEGORY_TO_WIDGET,
  resolveQueueItemCategory,
  routeQueueItemToSection,
} from "@/lib/optimization-queue/queue-routing";
import { parseStagingVaultContent } from "@/lib/staging-vault/staging-vault-content";
import { isListingAssetTarget } from "@/lib/keywords/discovery-listing-asset";

export type { OptimizationQueueCategory };
export { ACTIVE_CONTEXT_SECTION_LABELS, CATEGORY_TO_WIDGET };

export type { ActiveContextSignalType, TypedActiveContextSignal };

export type VaultLocale = "en" | "ar";

/** Canonical source ownership for routing and de-duplication. */
export type ActiveContextSourceTag =
  | "keyword_tracker"
  | "market_intel"
  | "competitor_spy"
  | "review_analysis"
  | "keyword_spotlight"
  | "staging_vault";

/** Active Context UI widget — each signal maps to exactly one. */
export type ActiveContextWidget =
  | "keyword_tracker"
  | "market_opportunities"
  | "review_issues"
  | "competitor_keywords";

export interface OptimizerContextItem {
  id: string;
  signalType: string;
  content: string;
  source: string;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  language: VaultLocale;
  stagedAt: string;
  metadata: Record<string, unknown>;
  /** Resolved source tag for widget routing. */
  sourceTag: ActiveContextSourceTag;
  /** Target widget — prevents cross-pillar duplication. */
  targetWidget: ActiveContextWidget;
  /** User explicitly staged or pinned this signal for the listing session. */
  explicitlyStaged: boolean;
}

export interface VaultRowForContext {
  id: string;
  app_id: string;
  state_en: Record<string, unknown> | null;
  state_ar: Record<string, unknown> | null;
  updated_at: string | null;
  deleted_at: string | null;
  is_deleted: boolean | null;
}

export interface PartitionedActiveContext {
  keyword_tracker: OptimizerContextItem[];
  market_opportunities: OptimizerContextItem[];
  review_issues: OptimizerContextItem[];
  competitor_keywords: OptimizerContextItem[];
  all: OptimizerContextItem[];
}

function stateBranch(row: VaultRowForContext, locale: VaultLocale): Record<string, unknown> {
  const raw = locale === "ar" ? row.state_ar : row.state_en;
  return raw && typeof raw === "object" ? raw : {};
}

function normalizeKeywords(
  raw: unknown,
): Array<{ term: string; category: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ term: string; category: string }> = [];
  for (const kw of raw) {
    if (typeof kw === "string" && kw.trim()) {
      out.push({ term: kw.trim(), category: "high_volume" });
    } else if (kw && typeof kw === "object") {
      const o = kw as Record<string, unknown>;
      const term = String(o.term ?? o.keyword ?? "").trim();
      if (!term) continue;
      out.push({
        term,
        category: String(o.category ?? "high_volume"),
      });
    }
  }
  return out;
}

function keywordNorm(term: string): string {
  return term.trim().toLowerCase();
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

/** Keyword vault entry was explicitly moved to staging (not passively tracked). */
export function isExplicitlyStagedKeywordEntry(
  entry: Record<string, unknown>,
): boolean {
  if (isTruthyFlag(entry.pinned) || isTruthyFlag(entry.is_pinned)) return true;

  const hasStagedAt =
    typeof entry.staged_at === "string" || typeof entry.stagedAt === "string";
  const targetAsset = entry.target_asset ?? entry.targetAsset;
  const hasTargetAsset = isListingAssetTarget(targetAsset);
  const discovery =
    entry.discovery_source ?? entry.discoverySource ?? entry.source;

  if (
    hasStagedAt &&
    (hasTargetAsset ||
      discovery === "ai_suggested" ||
      discovery === "keyword_tracker" ||
      discovery === "manual")
  ) {
    return true;
  }

  return false;
}

export function resolveSourceTag(args: {
  source: string;
  sourceContext?: string;
  metadata?: Record<string, unknown>;
}): ActiveContextSourceTag {
  const source = args.source.toLowerCase();
  const ctx = String(args.sourceContext ?? "").toLowerCase();
  const discovery = String(
    args.metadata?.discovery_source ?? args.metadata?.discoverySource ?? "",
  ).toLowerCase();

  if (
    source === "keyword_tracker" ||
    ctx.includes("keyword_tracker") ||
    discovery === "keyword_tracker" ||
    discovery === "ai_suggested"
  ) {
    return "keyword_tracker";
  }

  if (
    source === "keyword_spotlight" ||
    source === "market_intelligence" ||
    ctx.includes("market") ||
    ctx.includes("spotlight") ||
    discovery === "market_intel"
  ) {
    return "market_intel";
  }

  if (source === "competitor_spy" || ctx.includes("competitor")) {
    return "competitor_spy";
  }

  if (source === "review_analysis" || ctx.includes("review") || ctx.includes("issue")) {
    return "review_analysis";
  }

  if (source === "keyword_spotlight") {
    return "keyword_spotlight";
  }

  return "staging_vault";
}

export function resolveTargetWidget(
  sourceTag: ActiveContextSourceTag,
  signalType: string,
): ActiveContextWidget {
  if (sourceTag === "keyword_tracker") return "keyword_tracker";

  if (sourceTag === "market_intel" || sourceTag === "keyword_spotlight") {
    return "market_opportunities";
  }

  if (sourceTag === "review_analysis" || signalType === "review_issue") {
    return "review_issues";
  }

  if (sourceTag === "competitor_spy" || signalType === "optimization_insight") {
    return "competitor_keywords";
  }

  return "market_opportunities";
}

/** Category → widget routing table (queue SSOT). */
export function resolveWidgetFromCategory(
  category: OptimizationQueueCategory,
): ActiveContextWidget {
  return CATEGORY_TO_WIDGET[category];
}

function enrichItem(
  partial: Omit<OptimizerContextItem, "sourceTag" | "targetWidget" | "explicitlyStaged"> & {
    explicitlyStaged?: boolean;
  },
): OptimizerContextItem {
  const sourceTag = resolveSourceTag({
    source: partial.source,
    sourceContext: partial.sourceContext,
    metadata: partial.metadata,
  });
  const targetWidget = resolveTargetWidget(sourceTag, partial.signalType);
  return {
    ...partial,
    sourceTag,
    targetWidget,
    explicitlyStaged: partial.explicitlyStaged ?? true,
    metadata: {
      ...partial.metadata,
      sourceTag,
      targetWidget,
    },
  };
}

export function isExplicitlyStagedContextItem(item: OptimizerContextItem): boolean {
  if (!item.explicitlyStaged) return false;

  if (item.targetWidget === "keyword_tracker" && item.signalType === "keyword") {
    const meta = item.metadata;
    return (
      isTruthyFlag(meta.pinned) ||
      isTruthyFlag(meta.is_pinned) ||
      Boolean(meta.staged_at ?? meta.stagedAt ?? item.stagedAt) ||
      isListingAssetTarget(meta.targetAsset ?? meta.target_asset)
    );
  }

  return true;
}

/**
 * De-duplicate: tracker keywords must not appear in market opportunities.
 * Within each widget, de-dupe by normalized content/keyword term.
 */
export function deduplicateActiveContextItems(
  items: OptimizerContextItem[],
): OptimizerContextItem[] {
  const trackerTerms = new Set<string>();
  for (const item of items) {
    if (item.targetWidget === "keyword_tracker" && item.signalType === "keyword") {
      trackerTerms.add(keywordNorm(item.content));
    }
  }

  const seenByWidget = new Map<ActiveContextWidget, Set<string>>();

  return items.filter((item) => {
    if (
      item.targetWidget === "market_opportunities" &&
      item.signalType === "keyword" &&
      trackerTerms.has(keywordNorm(item.content))
    ) {
      return false;
    }

    const key =
      item.signalType === "keyword"
        ? keywordNorm(item.content)
        : `${item.signalType}:${keywordNorm(item.content)}`;

    const widgetSeen = seenByWidget.get(item.targetWidget) ?? new Set<string>();
    if (widgetSeen.has(key)) return false;
    widgetSeen.add(key);
    seenByWidget.set(item.targetWidget, widgetSeen);
    return true;
  });
}

export function partitionActiveContextByWidget(
  items: OptimizerContextItem[] | undefined,
): PartitionedActiveContext {
  const curated = deduplicateActiveContextItems(
    (items ?? []).filter(isExplicitlyStagedContextItem),
  );

  const partitioned: PartitionedActiveContext = {
    keyword_tracker: [],
    market_opportunities: [],
    review_issues: [],
    competitor_keywords: [],
    all: curated,
  };

  for (const item of curated) {
    partitioned[item.targetWidget].push(item);
  }

  return partitioned;
}

type QueueItemRecord = {
  id: string;
  type: string;
  category?: OptimizationQueueCategory;
  content: string;
  source: string;
  sourceContext?: string;
  sourceContextId?: string;
  language?: string;
  stagedAt?: string;
  metadata?: Record<string, unknown>;
};

export function normalizeQueueSignalType(type: string): ActiveContextSignalType {
  switch (type) {
    case "review_pain_point":
      return "review_pain_point";
    case "feature_request":
      return "feature_request";
    case "competitor_strength":
    case "competitor_weakness":
      return "competitor_strength";
    case "keyword_gap":
    case "competitor_keyword":
    case "market_keyword":
    default:
      return "keyword_gap";
  }
}

export function toTypedActiveContextSignal(
  item: OptimizationQueueItem,
): TypedActiveContextSignal {
  return {
    type: normalizeQueueSignalType(item.type),
    payload: {
      id: item.id,
      content: item.content,
      source: item.source,
      language: item.language,
      stagedAt: item.stagedAt,
      metadata: item.metadata ?? {},
    },
  };
}

export interface PartitionedQueueBySignalType {
  keyword_gaps: TypedActiveContextSignal[];
  review_insights: TypedActiveContextSignal[];
  feature_requests: TypedActiveContextSignal[];
  competitor_strengths: TypedActiveContextSignal[];
  all: TypedActiveContextSignal[];
}

export function partitionQueueItemsBySignalType(
  items: OptimizationQueueItem[],
): PartitionedQueueBySignalType {
  const partitioned: PartitionedQueueBySignalType = {
    keyword_gaps: [],
    review_insights: [],
    feature_requests: [],
    competitor_strengths: [],
    all: [],
  };

  for (const item of items) {
    const routing = routeQueueItemToSection(item);
    const category = routing?.category ?? resolveQueueItemCategory(item);

    const typed = toTypedActiveContextSignal(item);
    partitioned.all.push(typed);

    switch (category) {
      case "review":
        if (typed.type === "feature_request") {
          partitioned.feature_requests.push(typed);
        } else {
          partitioned.review_insights.push(typed);
        }
        break;
      case "strength":
        partitioned.competitor_strengths.push(typed);
        break;
      case "tracker":
        break;
      case "opportunity":
      default:
        partitioned.keyword_gaps.push(typed);
        break;
    }
  }

  return partitioned;
}

export interface PartitionedQueueByCategory {
  tracker: OptimizationQueueItem[];
  review: OptimizationQueueItem[];
  opportunity: OptimizationQueueItem[];
  strength: OptimizationQueueItem[];
  all: OptimizationQueueItem[];
}

/** Partition queue items by rigid category routing (SSOT). */
export function partitionQueueItemsByCategory(
  items: OptimizationQueueItem[],
): PartitionedQueueByCategory {
  const partitioned: PartitionedQueueByCategory = {
    tracker: [],
    review: [],
    opportunity: [],
    strength: [],
    all: [],
  };

  for (const item of items) {
    const routing = routeQueueItemToSection(item);
    if (!routing) continue;

    partitioned.all.push(item);
    partitioned[routing.category].push(item);
  }

  return partitioned;
}

function queueTypeToSignalType(type: string): string {
  const normalized = normalizeQueueSignalType(type);
  switch (normalized) {
    case "keyword_gap":
      return "keyword";
    case "review_pain_point":
    case "feature_request":
      return "review_issue";
    case "competitor_strength":
      return "optimization_insight";
    default:
      return "keyword";
  }
}

/**
 * Read curated items from optimization_queue namespace only (no raw discovery streams).
 */
export function flattenQueueToActiveItems(
  rows: VaultRowForContext[],
  locale: VaultLocale,
): OptimizerContextItem[] {
  const items: OptimizerContextItem[] = [];

  for (const row of rows) {
    if (row.deleted_at || row.is_deleted) continue;

    const features = (stateBranch(row, locale).features ?? {}) as Record<string, unknown>;
    const queueRaw = features.optimization_queue as { items?: QueueItemRecord[] } | undefined;
    const queueItems = Array.isArray(queueRaw?.items) ? queueRaw!.items! : [];

    for (const entry of queueItems) {
      const content = String(entry.content ?? "").trim();
      if (!content) continue;
      if (entry.language && entry.language !== locale) continue;

      const queueItem: OptimizationQueueItem = {
        id: String(entry.id ?? `${row.id}:queue:${content}`),
        type: (entry.type ?? "keyword_gap") as OptimizationQueueItem["type"],
        category: resolveQueueItemCategory({
          type: (entry.type ?? "keyword_gap") as OptimizationQueueItem["type"],
          category: entry.category,
          metadata: entry.metadata,
        }),
        content,
        source: (entry.source ?? "manual") as OptimizationQueueItem["source"],
        sourceContext: entry.sourceContext,
        sourceContextId: entry.sourceContextId,
        language: locale,
        stagedAt: String(entry.stagedAt ?? row.updated_at ?? new Date().toISOString()),
        metadata: entry.metadata ?? {},
      };

      const routing = routeQueueItemToSection(queueItem);
      if (!routing) continue;

      const sourceTag = resolveSourceTag({
        source: queueItem.source,
        sourceContext: queueItem.sourceContext,
        metadata: queueItem.metadata,
      });
      const signalType = queueTypeToSignalType(queueItem.type);
      const targetWidget = routing.destination_widget;

      items.push({
        id: queueItem.id,
        signalType,
        content,
        source: queueItem.source,
        sourceAppId: row.app_id,
        sourceContext: queueItem.sourceContext,
        sourceContextId: queueItem.sourceContextId,
        language: locale,
        stagedAt: queueItem.stagedAt,
        metadata: {
          ...queueItem.metadata,
          queue_type: queueItem.type,
          queue_category: routing.category,
          source_origin: routing.source_origin,
          destination_section: routing.destination_section,
          sourceTag,
          targetWidget,
        },
        sourceTag,
        targetWidget,
        explicitlyStaged: true,
      });
    }
  }

  return deduplicateActiveContextItems(items);
}

/**
 * Flatten vault into curated activeItems — optimization queue only.
 */
export function flattenVaultToActiveItems(
  rows: VaultRowForContext[],
  locale: VaultLocale,
): OptimizerContextItem[] {
  return flattenQueueToActiveItems(rows, locale);
}

/** @deprecated Raw feature namespaces — kept for migration scripts only. */
export function flattenLegacyVaultDiscoveryToActiveItems(
  rows: VaultRowForContext[],
  locale: VaultLocale,
): OptimizerContextItem[] {
  const items: OptimizerContextItem[] = [];

  for (const row of rows) {
    if (row.deleted_at || row.is_deleted) continue;

    const features = (stateBranch(row, locale).features ?? {}) as Record<string, unknown>;
    const stagedAt = row.updated_at ?? new Date().toISOString();

    const reviewAnalysis = features.review_analysis as Record<string, unknown> | undefined;
    if (reviewAnalysis) {
      const improvements = (
        reviewAnalysis.opportunities ??
        reviewAnalysis.improvements ??
        []
      ) as Array<Record<string, unknown>>;

      improvements.forEach((imp, idx) => {
        const issue = String(imp.issue ?? imp.theme ?? "").trim();
        if (!issue) return;
        if (!isTruthyFlag(imp.staged) && !isTruthyFlag(imp.pinned)) return;

        items.push(
          enrichItem({
            id: `${row.id}:review:${idx}`,
            signalType: "review_issue",
            content: issue,
            source: "review_analysis",
            sourceAppId: row.app_id,
            language: locale,
            stagedAt: String(imp.staged_at ?? stagedAt),
            metadata: { ...imp, app_id: row.app_id, staged: true },
            explicitlyStaged: true,
          }),
        );
      });
    }

    const competitorSpy = features.competitor_spy as Record<string, unknown> | undefined;
    const competitors = (competitorSpy?.competitors ?? []) as Array<Record<string, unknown>>;

    competitors.forEach((comp, cIdx) => {
      if (!isTruthyFlag(comp.staged) && !isTruthyFlag(comp.pinned)) return;

      const compName = String(comp.app_name ?? comp.name ?? "Competitor").trim();
      const keywords = normalizeKeywords(comp.keywords);
      const weaknesses = Array.isArray(comp.weaknesses) ? comp.weaknesses : [];

      if (keywords.length === 0 && weaknesses.length === 0) return;

      items.push(
        enrichItem({
          id: `${row.id}:competitor:${cIdx}`,
          signalType: "optimization_insight",
          content:
            keywords.length > 0
              ? `Competitor keywords from ${compName} (${keywords.length})`
              : `Competitor insights from ${compName}`,
          source: "competitor_spy",
          sourceAppId: row.app_id,
          sourceContext: compName,
          sourceContextId: String(comp.competitor_id ?? comp.id ?? ""),
          language: locale,
          stagedAt: String(comp.staged_at ?? stagedAt),
          metadata: {
            competitor_name: compName,
            keywords,
            category: "competitor_keyword",
            weaknesses,
            app_id: row.app_id,
            staged: true,
          },
          explicitlyStaged: true,
        }),
      );
    });

    const keywordTracker = features.keyword_tracker as Record<string, unknown> | undefined;
    const ktSignals = (keywordTracker?.signals ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, entry] of Object.entries(ktSignals)) {
      if (!isExplicitlyStagedKeywordEntry(entry)) continue;

      const keyword = String(entry.keyword ?? key).trim();
      if (!keyword) continue;

      items.push(
        enrichItem({
          id: `${row.id}:keyword_tracker:${key}`,
          signalType: "keyword",
          content: keyword,
          source: "keyword_tracker",
          sourceAppId: row.app_id,
          sourceContext: "keyword_tracker_alert",
          sourceContextId: key,
          language: locale,
          stagedAt: String(entry.staged_at ?? stagedAt),
          metadata: {
            targetAsset: entry.target_asset ?? entry.targetAsset,
            descriptionDraft: entry.description_draft ?? entry.descriptionDraft,
            discovery_source: entry.discovery_source ?? "keyword_tracker",
            market: entry.market,
            app_id: row.app_id,
            staged_at: entry.staged_at,
            pinned: entry.pinned ?? entry.is_pinned,
          },
          explicitlyStaged: true,
        }),
      );
    }

    const embedded = features.staged_signals as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(embedded)) {
      embedded.forEach((sig, idx) => {
        const rawContent = String(sig.content ?? "").trim();
        if (!rawContent) return;

        const parsed = parseStagingVaultContent(rawContent);
        const content = parsed?.keyword ?? rawContent;
        const meta = (sig.metadata as Record<string, unknown>) ?? {};
        const source = String(sig.source ?? "staging_vault");

        if (String(sig.signal_type ?? sig.signalType ?? "keyword") === "keyword") {
          const stagingCheck = {
            ...meta,
            keyword: content,
            target_asset: parsed?.targetAsset ?? meta.targetAsset,
            staged_at: parsed?.stagedAt ?? sig.created_at,
            discovery_source: parsed?.discoverySource ?? meta.discovery_source,
          };
          if (!isExplicitlyStagedKeywordEntry(stagingCheck)) return;
        }

        items.push(
          enrichItem({
            id: String(sig.id ?? `${row.id}:embedded:${idx}`),
            signalType: String(sig.signal_type ?? sig.signalType ?? "keyword"),
            content,
            source,
            sourceAppId: row.app_id,
            sourceContext: sig.source_context as string | undefined,
            sourceContextId: sig.source_context_id as string | undefined,
            language: locale,
            stagedAt: String(sig.created_at ?? stagedAt),
            metadata: {
              ...meta,
              ...(parsed?.targetAsset ? { targetAsset: parsed.targetAsset } : {}),
              ...(parsed?.descriptionDraft ? { descriptionDraft: parsed.descriptionDraft } : {}),
              discovery_source: parsed?.discoverySource ?? meta.discovery_source,
              staged_at: parsed?.stagedAt ?? sig.created_at,
            },
            explicitlyStaged: true,
          }),
        );
      });
    }
  }

  return deduplicateActiveContextItems(items);
}

export function flattenVaultToArchivedItems(
  rows: VaultRowForContext[],
  locale: VaultLocale,
): Array<{
  id: string;
  signalType: string;
  archivedAt: string;
  archivedReason: string;
}> {
  return rows
    .filter((r) => Boolean(r.deleted_at) || r.is_deleted === true)
    .map((r) => ({
      id: r.id,
      signalType: "vault_row",
      archivedAt: r.deleted_at ?? r.updated_at ?? new Date().toISOString(),
      archivedReason: "archived",
    }));
}
