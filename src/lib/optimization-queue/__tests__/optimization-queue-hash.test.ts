import { describe, expect, it } from "vitest";
import type { OptimizationQueueItem } from "@/lib/optimization-queue/optimization-queue.types";
import { buildActiveContextQueueHashCanonical } from "@/lib/optimization-queue/optimization-queue-hash-canonical";
import { computeActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-server";
import { SIGNAL_LIFECYCLE_STATUS } from "@/lib/signals/signal-lifecycle";

function sampleItem(
  overrides: Partial<OptimizationQueueItem> = {},
): OptimizationQueueItem {
  return {
    id: "oq-test-1",
    type: "review_pain_point",
    category: "review",
    signalCluster: "DEFENSIVE_PAIN_POINT",
    content: "Crashes on launch",
    source: "review_analysis",
    language: "en",
    stagedAt: "2026-01-01T00:00:00.000Z",
    metadata: {
      impact_percent: 42,
      growth_strategy_tag: "product_improvement",
    },
    ...overrides,
  };
}

describe("optimization-queue-hash", () => {
  it("produces stable hash for identical queue snapshots", () => {
    const items = [sampleItem(), sampleItem({ id: "oq-test-2", content: "Slow UI" })];
    const first = computeActiveContextQueueHash(items, "en");
    const second = computeActiveContextQueueHash([...items], "en");
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes hash when content or lifecycle status changes", () => {
    const base = [sampleItem()];
    const baseHash = computeActiveContextQueueHash(base, "en");
    const edited = computeActiveContextQueueHash(
      [sampleItem({ content: "Crashes after update" })],
      "en",
    );
    const demoted = computeActiveContextQueueHash(
      [
        sampleItem({
          type: "competitor_strength",
          category: "strength",
          signalCluster: "OFFENSIVE_GROWTH",
          status: SIGNAL_LIFECYCLE_STATUS.AUDIT,
          metadata: { strength_class: "market_dominating", core_differentiator: true },
        }),
      ],
      "en",
    );

    expect(edited).not.toBe(baseHash);
    expect(demoted).not.toBe(baseHash);
  });

  it("isolates EN and AR vault branches", () => {
    const enItem = sampleItem({ language: "en" });
    const arItem = sampleItem({ id: "oq-ar-1", language: "ar", content: "تعطل" });
    const mixed = [enItem, arItem];

    const enHash = computeActiveContextQueueHash(mixed, "en");
    const arHash = computeActiveContextQueueHash(mixed, "ar");

    expect(enHash).not.toBe(arHash);
    expect(buildActiveContextQueueHashCanonical(mixed, "en")).not.toContain("تعطل");
  });

  it("normalizes category and growth tags via SSOT resolvers", () => {
    const storedCategoryOpportunity = sampleItem({
      id: "oq-fr-1",
      type: "feature_request",
      category: "opportunity",
      source: "competitor_spy",
      content: "more recipe options",
      metadata: { signal_cluster: "MARKET_INTEL" },
    });
    const withCompetitor = sampleItem({
      id: "oq-str-1",
      type: "competitor_strength",
      category: "strength",
      source: "competitor_spy",
      content: "barcode scanner",
      status: "ACTIVE",
      metadata: {
        competitor_name: "MyFitnessPal",
        strength_class: "market_dominating",
        conversion_impact_score: 85,
      },
    });

    const hashA = computeActiveContextQueueHash([storedCategoryOpportunity], "en");
    const hashB = computeActiveContextQueueHash(
      [
        sampleItem({
          ...storedCategoryOpportunity,
          category: "review",
        }),
      ],
      "en",
    );
    expect(hashA).toBe(hashB);

    const hashStrength = computeActiveContextQueueHash([withCompetitor], "en");
    const hashStrengthNoTag = computeActiveContextQueueHash(
      [
        sampleItem({
          ...withCompetitor,
          metadata: {
            competitor_name: "MyFitnessPal",
            strength_class: "market_dominating",
            conversion_impact_score: 85,
          },
        }),
      ],
      "en",
    );
    expect(hashStrength).toBe(hashStrengthNoTag);
  });
});
