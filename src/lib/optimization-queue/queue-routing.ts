/**
 * Rigid signal → Active Context section routing for OptimizationQueueService.
 * Category is the primary routing key; type is secondary (legacy / synthesis).
 */

import type { ActiveContextWidget } from "@/lib/staging/optimizer-context-adapter";
import type {
  AddOptimizationQueueInput,
  OptimizationQueueCategory,
  OptimizationQueueItem,
  OptimizationQueueItemType,
  OptimizationQueueSource,
} from "@/lib/optimization-queue/optimization-queue.types";
import {
  enforceActiveContextSectionBoundary,
  isReviewInsightMetadata,
} from "@/lib/staging-vault/staging-vault-metadata";

export type { OptimizationQueueCategory };

export const OPTIMIZATION_QUEUE_CATEGORIES: readonly OptimizationQueueCategory[] = [
  "tracker",
  "review",
  "opportunity",
  "strength",
] as const;

/** Active Context UI section labels (console / debug). */
export const ACTIVE_CONTEXT_SECTION_LABELS: Record<OptimizationQueueCategory, string> = {
  tracker: "# KEYWORD TRACKER",
  review: "REVIEW INSIGHTS",
  opportunity: "MARKET INTELLIGENCE SIGNALS",
  strength: "COMPETITOR STRENGTHS",
};

/** Immutable routing table — category → widget. */
export const CATEGORY_TO_WIDGET: Record<OptimizationQueueCategory, ActiveContextWidget> = {
  tracker: "keyword_tracker",
  review: "review_issues",
  opportunity: "market_opportunities",
  strength: "competitor_keywords",
};

export type QueueSourceOrigin = OptimizationQueueSource | "keyword_validator";

export function isQueueCategory(value: unknown): value is OptimizationQueueCategory {
  return (
    typeof value === "string" &&
    (OPTIMIZATION_QUEUE_CATEGORIES as readonly string[]).includes(value)
  );
}

export function resolveSourceOrigin(
  item: Pick<OptimizationQueueItem, "source" | "metadata">,
): QueueSourceOrigin {
  const fromMeta = item.metadata?.source_origin;
  if (typeof fromMeta === "string" && fromMeta.trim()) {
    return fromMeta.trim() as QueueSourceOrigin;
  }
  return item.source;
}

/** Infer category from legacy queue item type when category is absent. */
export function inferCategoryFromType(type: OptimizationQueueItemType): OptimizationQueueCategory {
  switch (type) {
    case "review_pain_point":
    case "feature_request":
      return "review";
    case "competitor_strength":
    case "competitor_weakness":
      return "strength";
    case "market_keyword":
      return "opportunity";
    default:
      return "opportunity";
  }
}

/** Resolve category from item — explicit field wins, then metadata, then type inference. */
export function resolveQueueItemCategory(
  item: Pick<OptimizationQueueItem, "type" | "category" | "metadata" | "source">,
): OptimizationQueueCategory {
  const metaSection = item.metadata?.active_context_section;
  if (isQueueCategory(metaSection)) {
    return enforceActiveContextSectionBoundary({
      signalType: item.type,
      source: item.source,
      proposedSection: metaSection,
      metadata: item.metadata,
    });
  }

  if (isQueueCategory(item.category)) {
    return enforceActiveContextSectionBoundary({
      signalType: item.type,
      source: item.source,
      proposedSection: item.category,
      metadata: item.metadata,
    });
  }

  const metaCat = item.metadata?.category;
  if (isQueueCategory(metaCat)) {
    return enforceActiveContextSectionBoundary({
      signalType: item.type,
      source: item.source,
      proposedSection: metaCat,
      metadata: item.metadata,
    });
  }

  // Strict isolation: review-derived items never land in opportunity.
  if (
    item.type === "review_pain_point" ||
    item.type === "feature_request" ||
    item.source === "review_analysis" ||
    isReviewInsightMetadata(item.metadata)
  ) {
    return "review";
  }

  if (item.type === "market_keyword" && item.source === "keyword_tracker") {
    return "tracker";
  }

  return enforceActiveContextSectionBoundary({
    signalType: item.type,
    source: item.source,
    proposedSection: inferCategoryFromType(item.type),
    metadata: item.metadata,
  });
}

/**
 * Infer category for new queue inputs from type + source when category omitted.
 */
export function inferCategoryForInput(
  input: Pick<AddOptimizationQueueInput, "type" | "source" | "category" | "metadata">,
): OptimizationQueueCategory {
  if (isQueueCategory(input.category)) return input.category;
  const metaCat = input.metadata?.category;
  if (isQueueCategory(metaCat)) return metaCat;

  if (input.source === "keyword_tracker" || input.source === "manual") {
    return "tracker";
  }
  if (input.source === "review_analysis") {
    return "review";
  }
  if (input.source === "market_intel") {
    return "opportunity";
  }
  if (input.source === "competitor_spy") {
    if (
      input.type === "review_pain_point" ||
      input.type === "feature_request"
    ) {
      return "review";
    }
    if (input.type === "competitor_strength" || input.type === "competitor_weakness") {
      return "strength";
    }
    return "opportunity";
  }

  return inferCategoryFromType(input.type);
}

export function assertQueueCategory(
  category: unknown,
): OptimizationQueueCategory {
  if (!isQueueCategory(category)) {
    throw new Error(
      `Optimization queue item requires category: tracker | review | opportunity | strength (got: ${String(category)})`,
    );
  }
  return category;
}

export interface QueueRoutingDecision {
  source_origin: QueueSourceOrigin;
  category: OptimizationQueueCategory;
  destination_section: string;
  destination_widget: ActiveContextWidget;
  blocked_competitor_tracker: boolean;
}

/**
 * Route a queue item to exactly one Active Context widget.
 * Blocks competitor_spy signals from the Keyword Tracker section.
 */
export function routeQueueItemToSection(
  item: Pick<OptimizationQueueItem, "type" | "category" | "source" | "content" | "metadata">,
): QueueRoutingDecision | null {
  const source_origin = resolveSourceOrigin(item);
  let category = resolveQueueItemCategory(item);
  let blocked_competitor_tracker = false;

  if (source_origin === "competitor_spy" && category === "tracker") {
    blocked_competitor_tracker = true;
    category = "opportunity";
  }

  const destination_widget = CATEGORY_TO_WIDGET[category];
  const destination_section = ACTIVE_CONTEXT_SECTION_LABELS[category];

  if (typeof console !== "undefined" && console.info) {
    console.info("[optimizer-context-adapter] signal routed", {
      source_origin,
      category,
      destination_section,
      destination_widget,
      blocked_competitor_tracker,
      content_preview: item.content.trim().slice(0, 80),
    });
  }

  return {
    source_origin,
    category,
    destination_section,
    destination_widget,
    blocked_competitor_tracker,
  };
}

export function normQueueContent(value: string): string {
  return value.trim().toLowerCase();
}

/** De-dupe within the same Active Context section (category). */
export function sectionDedupeKey(
  item: Pick<OptimizationQueueItem, "category" | "type" | "content" | "metadata">,
): string {
  const category = resolveQueueItemCategory(item);
  return `${category}:${normQueueContent(item.content)}`;
}

export function sectionDedupeKeyForInput(
  input: Pick<AddOptimizationQueueInput, "type" | "category" | "content" | "source" | "metadata">,
): string {
  const category = inferCategoryForInput(input);
  return `${category}:${normQueueContent(input.content)}`;
}

export type QueueInputDiffResult = {
  toAdd: AddOptimizationQueueInput[];
  alreadyQueued: AddOptimizationQueueInput[];
  skippedCount: number;
  allQueued: boolean;
  isEmpty: boolean;
};

/**
 * Diff incoming queue inputs against OptimizationQueueService items (SSOT).
 * Only `toAdd` should be sent to the API.
 */
export function diffQueueInputs(
  inputs: AddOptimizationQueueInput[],
  existing: OptimizationQueueItem[],
): QueueInputDiffResult {
  const seen = new Set(existing.map(sectionDedupeKey));
  const toAdd: AddOptimizationQueueInput[] = [];
  const alreadyQueued: AddOptimizationQueueInput[] = [];
  const batchSeen = new Set<string>();

  for (const input of inputs) {
    const content = input.content.trim();
    if (!content) continue;

    const key = sectionDedupeKeyForInput(input);
    if (batchSeen.has(key)) continue;
    batchSeen.add(key);

    if (seen.has(key)) {
      alreadyQueued.push(input);
    } else {
      toAdd.push(input);
    }
  }

  const total = toAdd.length + alreadyQueued.length;
  return {
    toAdd,
    alreadyQueued,
    skippedCount: alreadyQueued.length,
    allQueued: total > 0 && toAdd.length === 0,
    isEmpty: total === 0,
  };
}
