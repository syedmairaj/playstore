import type { OptimizationQueueSynthesisPayload } from "@/lib/optimization-queue/optimization-queue.types";
import { GROWTH_STRATEGY_TAG } from "@/lib/review-insights/growth-strategy-tags";

/** Active Context ASO Growth strategy — drives listing rewrite tone and structure. */
export type ActiveContextStrategyMode = "defensive" | "offensive";

export type PrioritizedStagedIssue = {
  label: string;
  impactPercent?: number;
  growthStrategyTag: "product_improvement" | "oppositional_target";
};

function impactWeight(impactPercent?: number): number {
  return typeof impactPercent === "number" && impactPercent > 0 ? impactPercent : 1;
}

/** Top staged review issues sorted by Impact % (descending). */
export function topStagedIssuesByImpact(
  signals: OptimizationQueueSynthesisPayload["reviewStagedSignals"],
  limit = 3,
): PrioritizedStagedIssue[] {
  return [...signals]
    .sort((a, b) => impactWeight(b.impactPercent) - impactWeight(a.impactPercent))
    .slice(0, limit)
    .map((s) => ({
      label: s.label,
      impactPercent: s.impactPercent,
      growthStrategyTag: s.growthStrategyTag,
    }));
}

/**
 * Derives the dominant strategy mode from staged review signals in Active Context.
 * Impact-weighted when both defensive and offensive items are present.
 */
export function resolveActiveContextStrategyMode(
  signals: OptimizationQueueSynthesisPayload["reviewStagedSignals"],
): ActiveContextStrategyMode {
  const oppositional = signals.filter(
    (s) => s.growthStrategyTag === GROWTH_STRATEGY_TAG.oppositionalTarget,
  );
  const defensive = signals.filter(
    (s) => s.growthStrategyTag === GROWTH_STRATEGY_TAG.productImprovement,
  );

  if (oppositional.length === 0) return "defensive";
  if (defensive.length === 0) return "offensive";

  const oppWeight = oppositional.reduce((sum, s) => sum + impactWeight(s.impactPercent), 0);
  const defWeight = defensive.reduce((sum, s) => sum + impactWeight(s.impactPercent), 0);
  return oppWeight >= defWeight ? "offensive" : "defensive";
}
