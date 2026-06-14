import { describe, expect, it } from "vitest";
import { validateQueuePayload } from "@/lib/client/validate-and-queue";
import { reviewExploitToQueueInputs } from "@/lib/client/optimization-queue-client";
import { partitionQueueItemsBySignalType } from "@/lib/staging/optimizer-context-adapter";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

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
});
