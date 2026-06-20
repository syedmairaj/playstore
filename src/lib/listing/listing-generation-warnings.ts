export type ListingGenerationWarningCode =
  | "stale_active_context"
  | "empty_optimization_queue"
  | "low_keyword_coverage"
  | "missing_exploit_targets"
  | "missing_review_signals"
  | "sparse_active_context"
  | "partial_model_output"
  | "short_variations_repaired"
  | "missing_context_short"
  | "category_best_practices"
  | "long_vault_cache_fallback"
  | "long_description_below_target"
  | "long_description_short"
  | "long_expansion_skipped"
  | "long_assembly_adjusted";

export type ListingGenerationWarning = {
  code: ListingGenerationWarningCode;
  severity: "info" | "warning";
  message: string;
};

export type ListingGenerationHealthLabel = "excellent" | "good" | "fair" | "limited";

export type ListingGenerationWarningsPayload = {
  items: ListingGenerationWarning[];
  healthScore: number;
  healthLabel: ListingGenerationHealthLabel;
  missingDataPercent: number;
};

const WARNING_SCORE_PENALTY: Record<ListingGenerationWarningCode, number> = {
  stale_active_context: 12,
  empty_optimization_queue: 22,
  low_keyword_coverage: 18,
  missing_exploit_targets: 14,
  missing_review_signals: 10,
  sparse_active_context: 12,
  partial_model_output: 8,
  short_variations_repaired: 10,
  missing_context_short: 6,
  category_best_practices: 16,
  long_vault_cache_fallback: 10,
  long_description_below_target: 8,
  long_description_short: 12,
  long_expansion_skipped: 6,
  long_assembly_adjusted: 4,
};

export function healthLabelFromScore(score: number): ListingGenerationHealthLabel {
  if (score >= 85) return "excellent";
  if (score >= 70) return "good";
  if (score >= 50) return "fair";
  return "limited";
}

export function buildWarningsPayload(
  items: ListingGenerationWarning[],
): ListingGenerationWarningsPayload {
  const unique = dedupeWarnings(items);
  const penalty = unique.reduce(
    (sum, item) => sum + (WARNING_SCORE_PENALTY[item.code] ?? 8),
    0,
  );
  const healthScore = Math.max(0, Math.min(100, 100 - penalty));
  const missingDataPercent = Math.max(0, Math.min(100, 100 - healthScore));
  return {
    items: unique,
    healthScore,
    healthLabel: healthLabelFromScore(healthScore),
    missingDataPercent,
  };
}

export function dedupeWarnings(
  items: ListingGenerationWarning[],
): ListingGenerationWarning[] {
  const seen = new Set<string>();
  const out: ListingGenerationWarning[] = [];
  for (const item of items) {
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    out.push(item);
  }
  return out;
}

export function mergeWarningsPayload(
  existing: ListingGenerationWarningsPayload | null | undefined,
  incoming: ListingGenerationWarningsPayload | null | undefined,
): ListingGenerationWarningsPayload | null {
  if (!incoming?.items.length) return existing ?? null;
  if (!existing?.items.length) return incoming;
  return buildWarningsPayload([...existing.items, ...incoming.items]);
}
