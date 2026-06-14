import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  flattenQueueToActiveItems,
  partitionQueueItemsByCategory,
} from "@/lib/staging/optimizer-context-adapter";
import { routeQueueItemToSection } from "@/lib/optimization-queue/queue-routing";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function makeQueueItem(
  partial: Partial<OptimizationQueueItem> & Pick<OptimizationQueueItem, "content" | "category">,
): OptimizationQueueItem {
  return {
    id: partial.id ?? "oq-test-1",
    type: partial.type ?? "keyword_gap",
    category: partial.category,
    content: partial.content,
    source: partial.source ?? "competitor_spy",
    language: partial.language ?? "en",
    stagedAt: partial.stagedAt ?? new Date().toISOString(),
    metadata: partial.metadata ?? {},
  };
}

describe("optimizer context category routing", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("routes tracker category to keyword_tracker widget", () => {
    const item = makeQueueItem({
      category: "tracker",
      content: "calorie counter",
      source: "keyword_tracker",
      type: "market_keyword",
      metadata: { source_origin: "keyword_validator" },
    });

    const routing = routeQueueItemToSection(item);
    expect(routing?.destination_section).toBe("# KEYWORD TRACKER");
    expect(routing?.destination_widget).toBe("keyword_tracker");
  });

  it("blocks competitor_spy from keyword tracker and reroutes to market opportunities", () => {
    const item = makeQueueItem({
      category: "tracker",
      content: "rival keyword",
      source: "competitor_spy",
      metadata: { source_origin: "competitor_spy" },
    });

    const routing = routeQueueItemToSection(item);
    expect(routing?.blocked_competitor_tracker).toBe(true);
    expect(routing?.category).toBe("opportunity");
    expect(routing?.destination_section).toBe("MARKET OPPORTUNITIES");
  });

  it("partitions queue items by category without leaking competitor keywords into tracker", () => {
    const items: OptimizationQueueItem[] = [
      makeQueueItem({
        id: "t1",
        category: "tracker",
        content: "nutrition app",
        source: "keyword_tracker",
        type: "market_keyword",
        metadata: { source_origin: "keyword_validator" },
      }),
      makeQueueItem({
        id: "o1",
        category: "opportunity",
        content: "diet tracker",
        source: "competitor_spy",
        type: "keyword_gap",
        metadata: { source_origin: "competitor_spy" },
      }),
    ];

    const partitioned = partitionQueueItemsByCategory(items);
    expect(partitioned.tracker).toHaveLength(1);
    expect(partitioned.tracker[0]?.content).toBe("nutrition app");
    expect(partitioned.opportunity).toHaveLength(1);
    expect(partitioned.tracker.some((i) => i.content === "diet tracker")).toBe(false);
  });

  it("logs source_origin, category, and destination_section when routing", () => {
    const item = makeQueueItem({
      category: "review",
      content: "crashes on login",
      source: "competitor_spy",
      type: "review_pain_point",
      metadata: { source_origin: "competitor_spy" },
    });

    routeQueueItemToSection(item);

    expect(console.info).toHaveBeenCalledWith(
      "[optimizer-context-adapter] signal routed",
      expect.objectContaining({
        source_origin: "competitor_spy",
        category: "review",
        destination_section: "REVIEW INSIGHTS",
      }),
    );
  });

  it("flattenQueueToActiveItems assigns targetWidget from category routing table", () => {
    const rows = [
      {
        id: "vault-1",
        app_id: "app-1",
        state_en: {
          features: {
            optimization_queue: {
              items: [
                {
                  id: "q1",
                  type: "market_keyword",
                  category: "tracker",
                  content: "step counter",
                  source: "keyword_tracker",
                  language: "en",
                  stagedAt: "2026-06-12T12:00:00.000Z",
                  metadata: { source_origin: "keyword_validator", category: "tracker" },
                },
                {
                  id: "q2",
                  type: "keyword_gap",
                  category: "opportunity",
                  content: "fitness pal",
                  source: "competitor_spy",
                  language: "en",
                  stagedAt: "2026-06-12T12:01:00.000Z",
                  metadata: { source_origin: "competitor_spy", category: "opportunity" },
                },
              ],
            },
          },
        },
        state_ar: null,
        updated_at: "2026-06-12T12:00:00.000Z",
        deleted_at: null,
        is_deleted: false,
      },
    ];

    const active = flattenQueueToActiveItems(rows, "en");
    const trackerItems = active.filter((i) => i.targetWidget === "keyword_tracker");
    const marketItems = active.filter((i) => i.targetWidget === "market_opportunities");

    expect(trackerItems).toHaveLength(1);
    expect(trackerItems[0]?.content).toBe("step counter");
    expect(marketItems.some((i) => i.content === "fitness pal")).toBe(true);
    expect(trackerItems.some((i) => i.content === "fitness pal")).toBe(false);
  });
});
