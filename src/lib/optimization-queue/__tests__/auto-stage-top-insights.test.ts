import { describe, expect, it } from "vitest";
import { pickTopAutoStageInsightInputs } from "@/lib/optimization-queue/auto-stage-top-insights";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import { SIGNAL_LIFECYCLE_STATUS } from "@/lib/signals/signal-lifecycle";

function queueItem(
  overrides: Partial<OptimizationQueueItem> & Pick<OptimizationQueueItem, "id" | "content">,
): OptimizationQueueItem {
  return {
    type: "review_pain_point",
    category: "review",
    source: "competitor_spy",
    language: "en",
    stagedAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

describe("pickTopAutoStageInsightInputs", () => {
  it("prioritizes competitor vulnerabilities from vault audit rows", () => {
    const auditPain = queueItem({
      id: "pain-audit",
      content: "Aggressive paywall",
      metadata: { conversion_impact_score: 90, from_review_insights: true },
    });
    const active: OptimizationQueueItem[] = [];
    const all = [
      {
        ...auditPain,
        status: SIGNAL_LIFECYCLE_STATUS.AUDIT,
      } as OptimizationQueueItem,
      queueItem({
        id: "low",
        content: "Minor UI nit",
        metadata: { conversion_impact_score: 10 },
      }),
    ];

    const inputs = pickTopAutoStageInsightInputs({
      allQueueItems: all,
      activeQueueItems: active,
    });

    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.content).toBe("Aggressive paywall");
  });

  it("returns at most three inputs", () => {
    const all = Array.from({ length: 5 }, (_, index) =>
      queueItem({
        id: `p-${index}`,
        content: `Pain ${index}`,
        metadata: { conversion_impact_score: 80 - index },
      }),
    );

    const inputs = pickTopAutoStageInsightInputs({
      allQueueItems: all,
      activeQueueItems: [],
    });

    expect(inputs).toHaveLength(3);
  });
});
