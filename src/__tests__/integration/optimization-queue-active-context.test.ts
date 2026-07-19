import { describe, expect, it } from "vitest";
import { validateQueuePayload } from "@/lib/client/validate-and-queue";
import {
  competitorKeywordsToQueueInputs,
  keywordGapsToQueueInputs,
  reviewExploitToQueueInputs,
} from "@/lib/client/optimization-queue-client";
import {
  isCompetitorSpyQueueItem,
  partitionQueueForActiveContext,
} from "@/lib/client/active-context-from-queue";
import { partitionQueueItemsBySignalType } from "@/lib/staging/optimizer-context-adapter";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";

describe("optimization queue active context", () => {
  it("rejects empty queue payloads", () => {
    const result = validateQueuePayload([], "en");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("maps review pain points into Review Insights partition", () => {
    const items = reviewExploitToQueueInputs({
      painPoints: ["App crashes on login"],
      featureRequests: ["Dark mode"],
      competitorName: "Rival App",
      competitorId: "com.rival.app",
    });

    const validation = validateQueuePayload(items, "en");
    expect(validation.ok).toBe(true);
    expect(validation.items.some((i) => i.type === "review_pain_point")).toBe(true);

    const queueItems: OptimizationQueueItem[] = validation.items.map((input, idx) => ({
      id: `test-${idx}`,
      type: input.type,
      category: (input.category ?? "review") as OptimizationQueueItem["category"],
      content: input.content,
      source: input.source,
      language: "en",
      stagedAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    }));

    const partitioned = partitionQueueItemsBySignalType(queueItems);
    expect(partitioned.review_insights).toHaveLength(1);
    expect(partitioned.review_insights[0]?.payload.content).toBe("App crashes on login");
    expect(partitioned.feature_requests).toHaveLength(1);
  });

  it("surfaces oppositional Stage Issue reviews in Review Insights (not Competitive Defense)", () => {
    const queueItems: OptimizationQueueItem[] = [
      {
        id: "opp-1",
        type: "review_pain_point",
        category: "review",
        content: "Excessive Ads Block App Use",
        source: "review_analysis",
        language: "en",
        stagedAt: new Date().toISOString(),
        metadata: {
          growth_strategy_tag: "oppositional_target",
          growth_mode: "offensive",
          explicitly_staged: true,
          move_to_active_context: true,
          impact_percent: 100,
        },
      },
    ];

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.offensive).toHaveLength(1);
    expect(partitioned.reviewPills).toHaveLength(1);
    expect(partitioned.reviewPills[0]?.label).toBe("Excessive Ads Block App Use");
    expect(partitioned.marketIntelPills).toHaveLength(0);
    expect(partitioned.competitorSpyPills).toHaveLength(0);
  });

  it("keeps user-staged review pain points visible (backlog_id / explicitly_staged)", () => {
    const queueItems: OptimizationQueueItem[] = [
      {
        id: "staged-1",
        type: "review_pain_point",
        category: "review",
        content: "Aggressive Paywall Blocks Features",
        source: "review_analysis",
        sourceContext: "common_issues_theme",
        sourceContextId: "issue-1",
        language: "en",
        stagedAt: new Date().toISOString(),
        metadata: {
          category: "review",
          review_derived: true,
          from_review_insights: true,
          backlog_id: "backlog-uuid-1",
          explicitly_staged: true,
          move_to_active_context: true,
        },
      },
    ];

    const partitioned = partitionQueueItemsBySignalType(queueItems);
    expect(partitioned.review_insights).toHaveLength(1);
    expect(partitioned.review_insights[0]?.payload.content).toBe(
      "Aggressive Paywall Blocks Features",
    );
  });

  it("routes competitor spy keyword gaps to Competitive Defense chips (not Market Intel)", () => {
    const inputs = keywordGapsToQueueInputs(
      ["blood sugar tracker"],
      "Rival App",
      "com.rival.app",
    );
    const validation = validateQueuePayload(inputs, "en");
    expect(validation.ok).toBe(true);

    const queueItems: OptimizationQueueItem[] = validation.items.map((input, idx) => ({
      id: `spy-gap-${idx}`,
      type: input.type,
      category: resolveQueueItemCategory({
        type: input.type,
        category: input.category,
        metadata: input.metadata,
        source: input.source,
      }),
      content: input.content,
      source: input.source,
      language: "en",
      stagedAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    }));

    expect(isCompetitorSpyQueueItem(queueItems[0]!)).toBe(true);

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.market).toHaveLength(0);
    expect(partitioned.offensive).toHaveLength(1);
    // Gap keywords surface under Competitor Strengths in Active Context UI.
    expect(partitioned.competitorSpyPills).toHaveLength(1);
    expect(partitioned.competitorSpyPills[0]?.label).toBe("blood sugar tracker");
  });

  it("excludes legacy keyword curation from competitor spy pills", () => {
    const inputs = competitorKeywordsToQueueInputs(
      [{ term: "glucose monitor", category: "high_volume" }],
      "Rival App",
      "com.rival.app",
    );
    const validation = validateQueuePayload(inputs, "en");
    expect(validation.ok).toBe(true);

    const queueItems: OptimizationQueueItem[] = validation.items.map((input, idx) => ({
      id: `spy-kw-${idx}`,
      type: input.type,
      category: (input.category ?? "strength") as OptimizationQueueItem["category"],
      content: input.content,
      source: input.source,
      language: "en",
      stagedAt: new Date().toISOString(),
      metadata: input.metadata ?? {},
    }));

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.competitorSpyPills).toHaveLength(0);
  });

  it("includes ACTIVE competitor_strength in competitor spy pills", () => {
    const queueItems: OptimizationQueueItem[] = [
      {
        id: "strength-1",
        type: "competitor_strength",
        category: "strength",
        content: "barcode scanner",
        source: "competitor_spy",
        language: "en",
        stagedAt: new Date().toISOString(),
        status: "ACTIVE",
        metadata: {
          from_strength_audit: true,
        },
      },
    ];

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.competitorSpyPills).toHaveLength(1);
    expect(partitioned.competitorSpyPills[0]?.label).toBe("barcode scanner");
  });

  it("excludes AUDIT strengths from competitor spy pills", () => {
    const queueItems: OptimizationQueueItem[] = [
      {
        id: "audit-only",
        type: "competitor_strength",
        category: "strength",
        content: "pending strength",
        source: "competitor_spy",
        language: "en",
        stagedAt: new Date().toISOString(),
        status: "AUDIT",
        metadata: {},
      },
    ];

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.competitorSpyPills).toHaveLength(0);
  });

  it("excludes legacy metadata-only flags without top-level status", () => {
    const queueItems: OptimizationQueueItem[] = [
      {
        id: "strength-vault",
        type: "competitor_strength",
        category: "strength",
        content: "offline sync",
        source: "competitor_spy",
        language: "en",
        stagedAt: new Date().toISOString(),
        metadata: {
          move_to_active_context: true,
          origin_module: "competitor_spy",
        },
      },
    ];

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.competitorSpyPills).toHaveLength(0);
  });

  it("isolates competitor spy items by vault locale branch", () => {
    const enItem: OptimizationQueueItem = {
      id: "en-only",
      type: "competitor_strength",
      category: "strength",
      content: "EN strength",
      source: "competitor_spy",
      language: "en",
      stagedAt: new Date().toISOString(),
      status: "ACTIVE",
      metadata: {
        origin_module: "competitor_spy",
      },
    };
    const arItem: OptimizationQueueItem = {
      id: "ar-only",
      type: "competitor_strength",
      category: "strength",
      content: "كلمة عربية",
      source: "competitor_spy",
      language: "ar",
      stagedAt: new Date().toISOString(),
      status: "ACTIVE",
      metadata: {
        origin_module: "competitor_spy",
      },
    };

    const enPartition = partitionQueueForActiveContext(
      [enItem, arItem].filter((i) => i.language === "en"),
    );
    const arPartition = partitionQueueForActiveContext(
      [enItem, arItem].filter((i) => i.language === "ar"),
    );

    expect(enPartition.competitorSpyPills.map((p) => p.label)).toEqual(["EN strength"]);
    expect(arPartition.competitorSpyPills.map((p) => p.label)).toEqual(["كلمة عربية"]);
  });
});
