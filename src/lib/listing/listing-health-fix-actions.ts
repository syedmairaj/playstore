import type {
  ListingGenerationWarning,
  ListingGenerationWarningCode,
} from "@/lib/listing/listing-generation-warnings";
import { primaryKeywordMissingFromOpening } from "@/lib/listing/keyword-highlight";

export type ListingHealthFixActionId =
  | "refresh_active_context"
  | "focus_keywords"
  | "open_competitor_spy"
  | "open_reviews"
  | "open_keyword_tracker"
  | "scroll_active_context"
  | "regenerate_phase2_short"
  | "regenerate_long_ai"
  | "insert_primary_keyword_hook"
  | "expand_long_ai";

export type ListingHealthFixItem = {
  id: ListingHealthFixActionId;
  labelKey: string;
  relatedWarning?: ListingGenerationWarningCode;
};

const WARNING_FIXES: Partial<Record<ListingGenerationWarningCode, ListingHealthFixItem[]>> = {
  stale_active_context: [
    {
      id: "refresh_active_context",
      labelKey: "refreshActiveContext",
      relatedWarning: "stale_active_context",
    },
    {
      id: "scroll_active_context",
      labelKey: "reviewActiveQueue",
      relatedWarning: "stale_active_context",
    },
  ],
  empty_optimization_queue: [
    {
      id: "scroll_active_context",
      labelKey: "stageSignalsInQueue",
      relatedWarning: "empty_optimization_queue",
    },
    {
      id: "open_competitor_spy",
      labelKey: "openCompetitorSpy",
      relatedWarning: "empty_optimization_queue",
    },
  ],
  low_keyword_coverage: [
    {
      id: "focus_keywords",
      labelKey: "addTargetKeywords",
      relatedWarning: "low_keyword_coverage",
    },
    {
      id: "open_keyword_tracker",
      labelKey: "openKeywordTracker",
      relatedWarning: "low_keyword_coverage",
    },
  ],
  missing_exploit_targets: [
    {
      id: "open_competitor_spy",
      labelKey: "queueCompetitorGaps",
      relatedWarning: "missing_exploit_targets",
    },
  ],
  missing_review_signals: [
    {
      id: "open_reviews",
      labelKey: "addReviewInsights",
      relatedWarning: "missing_review_signals",
    },
  ],
  sparse_active_context: [
    {
      id: "scroll_active_context",
      labelKey: "curateMoreSignals",
      relatedWarning: "sparse_active_context",
    },
  ],
  partial_model_output: [
    {
      id: "regenerate_long_ai",
      labelKey: "regenerateLongSection",
      relatedWarning: "partial_model_output",
    },
  ],
  missing_context_short: [
    {
      id: "regenerate_phase2_short",
      labelKey: "generateShortDescription",
      relatedWarning: "missing_context_short",
    },
  ],
  category_best_practices: [
    {
      id: "focus_keywords",
      labelKey: "refineKeywordSeeds",
      relatedWarning: "category_best_practices",
    },
  ],
};

export function buildListingHealthFixes(args: {
  warnings: ListingGenerationWarning[];
  longText?: string;
  lockedKeywords?: string[];
  longMinChars?: number;
}): ListingHealthFixItem[] {
  const seen = new Set<ListingHealthFixActionId>();
  const fixes: ListingHealthFixItem[] = [];

  const push = (item: ListingHealthFixItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    fixes.push(item);
  };

  for (const warning of args.warnings) {
    for (const fix of WARNING_FIXES[warning.code] ?? []) {
      push(fix);
    }
  }

  const longText = args.longText?.trim() ?? "";
  const locked = args.lockedKeywords ?? [];
  const minChars = args.longMinChars ?? 500;

  if (
    longText &&
    locked.length > 0 &&
    primaryKeywordMissingFromOpening(longText, locked)
  ) {
    push({
      id: "insert_primary_keyword_hook",
      labelKey: "insertPrimaryKeywordFirstParagraph",
    });
  }

  if (longText && longText.length < minChars) {
    push({
      id: "expand_long_ai",
      labelKey: "expandDescriptionLength",
    });
  }

  return fixes;
}
