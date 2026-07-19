import { describe, expect, it } from "vitest";
import {
  buildDiscoveryFieldsFromActiveContext,
  hasDiscoverableActiveContext,
} from "@/lib/client/discovery-from-active-context";
import type { ActiveContextQueuePill } from "@/lib/client/active-context-from-queue";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function pill(id: string, label: string): ActiveContextQueuePill {
  return {
    id,
    label,
    source: "optimization_queue",
    signalCluster: null,
    item: {
      id,
      type: "keyword_gap",
      category: "competitor",
      content: label,
      source: "competitor_spy",
      metadata: {},
    } as ActiveContextQueuePill["item"],
  };
}

function tracker(content: string): OptimizationQueueItem {
  return {
    id: `t-${content}`,
    type: "keyword",
    category: "tracker",
    content,
    source: "keyword_tracker",
    metadata: {},
    status: "pending",
    created_at: new Date().toISOString(),
  } as OptimizationQueueItem;
}

describe("buildDiscoveryFieldsFromActiveContext", () => {
  it("builds keywords from tracker + competitor + market pills", () => {
    const result = buildDiscoveryFieldsFromActiveContext({
      trackerItems: [tracker("snap app")],
      competitorSpyPills: [pill("1", "pose camera"), pill("2", "snap pose")],
      marketIntelPills: [pill("3", "short videos")],
      reviewPills: [pill("4", "Excessive Ads")],
    });

    expect(result.keywords).toContain("snap app");
    expect(result.keywords).toContain("pose camera");
    expect(result.keywords).toContain("short videos");
    expect(result.features).toContain("Competitive opportunity: pose camera");
    expect(result.features).toContain("User insight: Excessive Ads");
    expect(result.features).toContain("Market demand: short videos");
  });

  it("returns empty strings when nothing is staged", () => {
    const result = buildDiscoveryFieldsFromActiveContext({
      trackerItems: [],
      competitorSpyPills: [],
      marketIntelPills: [],
      reviewPills: [],
    });
    expect(result.keywords).toBe("");
    expect(result.features).toBe("");
    expect(
      hasDiscoverableActiveContext({
        trackerItems: [],
        competitorSpyPills: [],
        marketIntelPills: [],
        reviewPills: [],
      }),
    ).toBe(false);
  });
});
