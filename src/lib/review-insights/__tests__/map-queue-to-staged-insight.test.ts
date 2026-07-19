import { describe, expect, it } from "vitest";
import { keywordGapsToQueueInputs } from "@/lib/client/optimization-queue-client";
import { reviewExploitToQueueInputs } from "@/lib/client/optimization-queue-client";
import {
  isStagedReviewQueueItem,
  mergeStagedQueueIntoAdopted,
} from "@/lib/review-insights/map-queue-to-staged-insight";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

function toQueueItem(
  input: ReturnType<typeof keywordGapsToQueueInputs>[number],
  id: string,
): OptimizationQueueItem {
  return {
    id,
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
  };
}

describe("mergeStagedQueueIntoAdopted — no cross-pillar duplication", () => {
  it("does not treat Queue gap keywords as Review Insights", () => {
    const gaps = keywordGapsToQueueInputs(
      ["pose camera", "guided poses"],
      "Snap Pose Camera",
      "com.example.pose",
    ).map((input, i) => toQueueItem(input, `gap-${i}`));

    for (const item of gaps) {
      expect(item.metadata?.explicitly_staged).toBe(true);
      expect(isStagedReviewQueueItem(item)).toBe(false);
    }

    const merged = mergeStagedQueueIntoAdopted([], gaps, "ws-1");
    expect(merged).toHaveLength(0);
  });

  it("still mirrors real review pain points into Review Insights", () => {
    const reviews = reviewExploitToQueueInputs({
      painPoints: ["Excessive Ads Block App Use"],
      competitorName: "Rival",
      competitorId: "com.rival",
    }).map((input, i) =>
      toQueueItem(
        {
          ...input,
          metadata: {
            ...(input.metadata ?? {}),
            explicitly_staged: true,
            move_to_active_context: true,
          },
        },
        `rev-${i}`,
      ),
    );

    expect(isStagedReviewQueueItem(reviews[0]!)).toBe(true);
    const merged = mergeStagedQueueIntoAdopted([], reviews, "ws-1");
    expect(merged).toHaveLength(1);
    expect(merged[0]?.title).toBe("Excessive Ads Block App Use");
  });

  it("does not duplicate gap keywords already present as adopted review titles", () => {
    const gaps = keywordGapsToQueueInputs(["pose camera"], "Rival", "com.rival").map(
      (input, i) => toQueueItem(input, `gap-${i}`),
    );
    const merged = mergeStagedQueueIntoAdopted(
      [
        {
          id: "adopted-1",
          workspaceId: "ws-1",
          competitorInsightsId: null,
          analysisTransactionId: null,
          packageName: "",
          langCode: "en",
          country: "us",
          title: "pose camera",
          description: "pose camera",
          severity: "MEDIUM",
          impact: 0,
          quote: "",
          category: "UX",
          status: "adopted",
          queueItemId: null,
          clusterIndex: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      gaps,
      "ws-1",
    );
    // Gap must not add a second "pose camera" via queue mirror
    expect(merged).toHaveLength(1);
  });
});
