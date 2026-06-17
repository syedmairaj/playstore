import { describe, expect, it } from "vitest";
import {
  buildActiveContextSynthesis,
  activeContextHasSignals,
} from "@/lib/optimization-queue/build-active-context-synthesis";
import { partitionQueueForActiveContext } from "@/lib/client/active-context-from-queue";
import { buildSynthesisFromOptimizationQueue } from "@/lib/optimization-queue/optimization-queue-synthesis";
import { resolveSignalCluster } from "@/lib/optimization-queue/signal-cluster";
import { buildListingOptimizerMessages } from "@/lib/prompts/listing-optimizer";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function queueItem(
  partial: Partial<OptimizationQueueItem> & Pick<OptimizationQueueItem, "id" | "type" | "content" | "source">,
): OptimizationQueueItem {
  return {
    category: partial.category ?? "review",
    language: partial.language ?? "en",
    stagedAt: partial.stagedAt ?? new Date().toISOString(),
    metadata: partial.metadata ?? {},
    ...partial,
  };
}

describe("cluster-to-generate pipeline", () => {
  it("assigns signalCluster and partitions into offensive/defensive/market", () => {
    const items: OptimizationQueueItem[] = [
      queueItem({
        id: "off-1",
        type: "competitor_keyword",
        category: "strength",
        content: "glucose tracker",
        source: "competitor_spy",
        signalCluster: "OFFENSIVE_GROWTH",
      }),
      queueItem({
        id: "def-1",
        type: "competitor_weakness",
        category: "strength",
        content: "Intrusive ads",
        source: "competitor_spy",
        signalCluster: "DEFENSIVE_PAIN_POINT",
      }),
      queueItem({
        id: "mkt-1",
        type: "keyword_gap",
        category: "opportunity",
        content: "AI coach",
        source: "market_intel",
        signalCluster: "MARKET_INTEL",
      }),
    ];

    const partition = partitionQueueForActiveContext(items);
    expect(partition.offensive).toHaveLength(1);
    expect(partition.defensive).toHaveLength(1);
    expect(partition.market).toHaveLength(1);

    const ctx = buildActiveContextSynthesis(items);
    expect(ctx.offensive[0]?.label).toBe("glucose tracker");
    expect(ctx.defensive[0]?.label).toBe("Intrusive ads");
    expect(ctx.market[0]?.label).toBe("AI coach");
    expect(activeContextHasSignals(ctx)).toBe(true);
  });

  it("injects cluster JSON and strategy instructions into LLM messages", () => {
    const synthesis = buildSynthesisFromOptimizationQueue([
      queueItem({
        id: "def-1",
        type: "review_pain_point",
        category: "review",
        content: "Crashes on launch",
        source: "review_analysis",
        signalCluster: "DEFENSIVE_PAIN_POINT",
      }),
      queueItem({
        id: "off-1",
        type: "competitor_keyword",
        category: "strength",
        content: "habit tracker",
        source: "competitor_spy",
        signalCluster: "OFFENSIVE_GROWTH",
      }),
    ]);

    const { system, user } = buildListingOptimizerMessages({
      appName: "Fit App",
      category: "Health",
      targetKeywords: ["fitness"],
      appFeatures: "Tracks habits.",
      toneStyle: "friendly",
      activeContext: synthesis.activeContext,
    });

    expect(system).toContain("Analyze offensive signals for high-intent keyword placement");
    expect(system).toContain("Prioritize defensive signals to increase conversion rate");
    expect(user).toContain('"offensive"');
    expect(user).toContain('"defensive"');
    expect(user).toContain("habit tracker");
  });

  it("infers cluster for legacy rows missing signalCluster", () => {
    const item = queueItem({
      id: "legacy-1",
      type: "keyword_gap",
      category: "opportunity",
      content: "market term",
      source: "market_intel",
      metadata: { origin_module: "market_intel", explicitly_staged: true },
    });
    expect(resolveSignalCluster(item)).toBe("MARKET_INTEL");
  });
});
