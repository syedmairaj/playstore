import { keywordGapsToQueueInputs } from "@/lib/client/optimization-queue-client";
import type {
  AddOptimizationQueueInput,
  OptimizationQueueItem,
} from "@/lib/optimization-queue";
import { sectionDedupeKey } from "@/lib/optimization-queue/queue-routing";
import { readGrowthStrategyTag } from "@/lib/review-insights/growth-strategy-tags";
import type { PendingReviewInsight } from "@/lib/review-insights/pending-insights.types";
import { SIGNAL_LIFECYCLE_STATUS } from "@/lib/signals/signal-lifecycle";
import type { KeywordSignal } from "@/lib/staging/keyword-signals";

const TOP_N = 3;

type ScoredCandidate = {
  score: number;
  input: AddOptimizationQueueInput;
};

function readCvrScore(meta: Record<string, unknown>): number {
  if (typeof meta.conversion_impact_score === "number") {
    return meta.conversion_impact_score;
  }
  if (typeof meta.impact_percent === "number") {
    return meta.impact_percent;
  }
  if (typeof meta.impactPercent === "number") {
    return meta.impactPercent;
  }
  if (typeof meta.confidence === "number") {
    return Math.round(meta.confidence * 100);
  }
  return 40;
}

function isCompetitorVulnerabilityItem(item: OptimizationQueueItem): boolean {
  if (item.type === "competitor_weakness") return true;
  if (item.type === "review_pain_point" && item.source === "competitor_spy") {
    return true;
  }
  if (
    item.type === "review_pain_point" &&
    readGrowthStrategyTag(item.metadata) === "oppositional_target"
  ) {
    return true;
  }
  if (item.type === "competitor_keyword" && item.metadata?.from_gap_analysis === true) {
    return true;
  }
  return false;
}

function queueItemToInput(item: OptimizationQueueItem): AddOptimizationQueueInput {
  return {
    type: item.type,
    content: item.content,
    source: item.source,
    category: item.category,
    ...(item.signalCluster ? { signalCluster: item.signalCluster } : {}),
    ...(item.type === "competitor_strength"
      ? { status: SIGNAL_LIFECYCLE_STATUS.ACTIVE }
      : {}),
    sourceContext: item.sourceContext,
    sourceContextId: item.sourceContextId,
    metadata: {
      ...(item.metadata ?? {}),
      explicitly_staged: true,
      from_generation_guardrail: true,
    },
  };
}

function pendingToInput(insight: PendingReviewInsight): AddOptimizationQueueInput {
  const tag = insight.growthStrategyTag;
  const cluster =
    tag === "oppositional_target" ? ("OFFENSIVE_GROWTH" as const) : ("DEFENSIVE_PAIN_POINT" as const);
  return {
    type: "review_pain_point",
    category: "review",
    content: insight.title.trim(),
    source: "review_analysis",
    signalCluster: cluster,
    sourceContext: "review_curation_adopt",
    sourceContextId: `pending_${insight.id}`,
    metadata: {
      category: "review",
      from_review_insights: true,
      pending_insight_id: insight.id,
      impact_percent: insight.impactPercent ?? Math.round(insight.impact * 100),
      ...(tag ? { growth_strategy_tag: tag } : {}),
      explicitly_staged: true,
      from_generation_guardrail: true,
      signal_cluster: cluster,
      cluster_category: cluster,
    },
  };
}

function dedupeKeyForInput(input: AddOptimizationQueueInput): string {
  return sectionDedupeKey({
    id: "probe",
    type: input.type,
    category: input.category ?? "review",
    content: input.content,
    source: input.source,
    language: "en",
    stagedAt: "",
    metadata: input.metadata ?? {},
  });
}

/**
 * Pick up to three high-CVR competitor vulnerability signals to stage before generation.
 */
export function pickTopAutoStageInsightInputs(args: {
  allQueueItems: OptimizationQueueItem[];
  activeQueueItems: OptimizationQueueItem[];
  pendingReviewInsights?: PendingReviewInsight[];
  keywordSignals?: KeywordSignal[];
}): AddOptimizationQueueInput[] {
  const activeKeys = new Set(args.activeQueueItems.map(sectionDedupeKey));
  const seen = new Set<string>();
  const candidates: ScoredCandidate[] = [];

  const push = (input: AddOptimizationQueueInput, score: number, vulnerabilityBias = 0) => {
    const key = dedupeKeyForInput(input);
    if (activeKeys.has(key) || seen.has(key)) return;
    seen.add(key);
    candidates.push({ score: score + vulnerabilityBias, input });
  };

  for (const item of args.allQueueItems) {
    if (activeKeys.has(sectionDedupeKey(item))) continue;
    const vulnerability = isCompetitorVulnerabilityItem(item);
    push(
      queueItemToInput(item),
      readCvrScore(item.metadata ?? {}),
      vulnerability ? 1_000 : 0,
    );
  }

  const pending = [...(args.pendingReviewInsights ?? [])]
    .filter((insight) => insight.status === "pending")
    .sort((a, b) => {
      const scoreA = a.impactPercent ?? Math.round(a.impact * 100);
      const scoreB = b.impactPercent ?? Math.round(b.impact * 100);
      return scoreB - scoreA;
    });

  for (const insight of pending) {
    const score = insight.impactPercent ?? Math.round(insight.impact * 100);
    const vulnerabilityBias =
      insight.growthStrategyTag === "oppositional_target" ? 500 : 0;
    push(pendingToInput(insight), score, vulnerabilityBias);
  }

  const signals = [...(args.keywordSignals ?? [])].sort(
    (a, b) => b.confidence - a.confidence,
  );
  for (const signal of signals.slice(0, 8)) {
    const [input] = keywordGapsToQueueInputs([signal.keyword]);
    if (input) {
      push(
        {
          ...input,
          metadata: {
            ...(input.metadata ?? {}),
            from_generation_guardrail: true,
            confidence: signal.confidence,
          },
        },
        Math.round(signal.confidence * 100),
        200,
      );
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, TOP_N).map((candidate) => candidate.input);
}
