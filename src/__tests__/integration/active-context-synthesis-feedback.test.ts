import { describe, expect, it } from "vitest";
import {
  buildActiveContextSynthesis,
} from "@/lib/optimization-queue/build-active-context-synthesis";
import { buildSynthesisFromOptimizationQueue } from "@/lib/optimization-queue/optimization-queue-synthesis";
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

describe("active context synthesis feedback loop", () => {
  it("includes structured cluster JSON in listing optimizer messages", () => {
    const synthesis = buildSynthesisFromOptimizationQueue([
      queueItem({
        id: "def-1",
        type: "competitor_weakness",
        category: "strength",
        content: "Intrusive ads",
        source: "competitor_spy",
        signalCluster: "DEFENSIVE_PAIN_POINT",
      }),
      queueItem({
        id: "off-1",
        type: "competitor_keyword",
        category: "strength",
        content: "blood sugar tracker",
        source: "competitor_spy",
        signalCluster: "OFFENSIVE_GROWTH",
      }),
    ]);

    const { system, user } = buildListingOptimizerMessages({
      appName: "Health App",
      category: "Health",
      targetKeywords: ["diabetes"],
      appFeatures: "Tracks glucose daily.",
      toneStyle: "professional",
      targetArabic: false,
      activeContext: synthesis.activeContext,
    });

    expect(system).toContain("maximize conversion rate (CVR)");
    expect(user).toContain("ACTIVE CONTEXT CLUSTERS");
    expect(user).toContain('"defensive"');
    expect(user).toContain("Intrusive ads");
    expect(user).toContain("blood sugar tracker");
  });

  it("isolates cluster buckets by vault locale branch", () => {
    const enItem = queueItem({
      id: "en-only",
      type: "competitor_keyword",
      category: "strength",
      content: "EN keyword",
      source: "competitor_spy",
      language: "en",
      signalCluster: "OFFENSIVE_GROWTH",
    });
    const arItem = queueItem({
      id: "ar-only",
      type: "competitor_keyword",
      category: "strength",
      content: "كلمة عربية",
      source: "competitor_spy",
      language: "ar",
      signalCluster: "OFFENSIVE_GROWTH",
    });

    const enPartition = buildActiveContextSynthesis(
      [enItem, arItem].filter((i) => i.language === "en"),
    );
    const arPartition = buildActiveContextSynthesis(
      [enItem, arItem].filter((i) => i.language === "ar"),
    );

    expect(enPartition.offensive.map((p) => p.label)).toEqual(["EN keyword"]);
    expect(arPartition.offensive.map((p) => p.label)).toEqual(["كلمة عربية"]);
  });
});
