import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildOptimizedContextFromItems,
  contentPreview,
  deduplicateByContentPreview,
  prioritizeAndLimitSignals,
  SOURCE_IMPACT_PRIORITY,
} from "@/lib/optimizer/context-adapter";
import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";

function item(
  partial: Partial<OptimizationQueueItem> & Pick<OptimizationQueueItem, "content" | "source">,
): OptimizationQueueItem {
  return {
    id: partial.id ?? "id-1",
    type: partial.type ?? "keyword_gap",
    category: partial.category ?? "opportunity",
    content: partial.content,
    source: partial.source,
    language: partial.language ?? "en",
    stagedAt: partial.stagedAt ?? new Date().toISOString(),
    metadata: partial.metadata ?? {},
  };
}

describe("OptimizerContextAdapter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deduplicates by content_preview using a Set", () => {
    const rows = deduplicateByContentPreview([
      item({ id: "t1", content: "Fitness", source: "keyword_tracker", category: "tracker" }),
      item({ id: "m1", content: "fitness", source: "market_intel", category: "opportunity" }),
      item({
        id: "r1",
        content: "crashes on launch",
        source: "review_analysis",
        category: "review",
        type: "review_pain_point",
      }),
    ]);

    expect(rows).toHaveLength(2);
    expect(contentPreview("Fitness")).toBe(contentPreview("fitness"));
    expect(rows.find((r) => contentPreview(r.content) === contentPreview("fitness"))?.source).toBe(
      "market_intel",
    );
    expect(SOURCE_IMPACT_PRIORITY.review_analysis).toBeGreaterThan(
      SOURCE_IMPACT_PRIORITY.market_intel,
    );
  });

  it("hard-caps prioritized signals to 5", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      item({
        id: `k${i}`,
        content: `keyword-${i}`,
        source: "keyword_tracker",
        category: "tracker",
      }),
    );
    expect(prioritizeAndLimitSignals(many)).toHaveLength(5);
  });

  it("prioritizes review_analysis in buildOptimizedContextFromItems", () => {
    const result = buildOptimizedContextFromItems([
      item({ id: "t1", content: "tracker term", source: "keyword_tracker", category: "tracker" }),
      item({
        id: "r1",
        content: "app crashes daily",
        source: "review_analysis",
        category: "review",
        type: "review_pain_point",
      }),
      item({ id: "m1", content: "market gap", source: "market_intel", category: "opportunity" }),
    ]);

    expect(result.items[0]?.source).toBe("review_analysis");
    const total =
      result.synthesis.offensive.length +
      result.synthesis.defensive.length +
      result.synthesis.market.length;
    expect(total).toBeLessThanOrEqual(5);
  });
});
