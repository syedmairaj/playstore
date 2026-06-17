/** ASO Growth methodology — defensive vs offensive review staging tags. */

export type ReviewGrowthMode = "defensive" | "offensive";

export type GrowthStrategyTag = "product_improvement" | "oppositional_target";

export const GROWTH_STRATEGY_TAG = {
  productImprovement: "product_improvement",
  oppositionalTarget: "oppositional_target",
} as const;

export function resolveReviewGrowthMode(input: {
  competitorName?: string | null;
  packageName?: string;
  ownPackageName?: string;
}): ReviewGrowthMode {
  if (input.competitorName?.trim()) return "offensive";
  if (
    input.packageName &&
    input.ownPackageName &&
    input.packageName.trim() !== input.ownPackageName.trim()
  ) {
    return "offensive";
  }
  return "defensive";
}

export function growthStrategyTagForMode(mode: ReviewGrowthMode): GrowthStrategyTag {
  return mode === "offensive"
    ? GROWTH_STRATEGY_TAG.oppositionalTarget
    : GROWTH_STRATEGY_TAG.productImprovement;
}

export function readGrowthStrategyTag(
  metadata: Record<string, unknown> | undefined,
): GrowthStrategyTag {
  const raw = metadata?.growth_strategy_tag;
  if (raw === GROWTH_STRATEGY_TAG.oppositionalTarget) {
    return GROWTH_STRATEGY_TAG.oppositionalTarget;
  }
  if (raw === GROWTH_STRATEGY_TAG.productImprovement) {
    return GROWTH_STRATEGY_TAG.productImprovement;
  }
  if (typeof metadata?.competitor_name === "string" && metadata.competitor_name.trim()) {
    return GROWTH_STRATEGY_TAG.oppositionalTarget;
  }
  return GROWTH_STRATEGY_TAG.productImprovement;
}

export function readImpactPercent(metadata: Record<string, unknown> | undefined): number | undefined {
  if (typeof metadata?.impact_percent === "number") {
    return Math.round(metadata.impact_percent);
  }
  if (typeof metadata?.original_impact_score === "number") {
    return Math.round(metadata.original_impact_score);
  }
  if (typeof metadata?.impactPercent === "number") {
    return Math.round(metadata.impactPercent);
  }
  return undefined;
}
