import { describe, expect, it } from "vitest";
import {
  isCompetitorGapOpportunityItem,
  partitionQueueForActiveContext,
} from "@/lib/client/active-context-from-queue";
import { keywordGapsToQueueInputs } from "@/lib/client/optimization-queue-client";
import { toTypedActiveContextSignal } from "@/lib/staging/optimizer-context-adapter";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

describe("competitor gap keywords → Competitor Strengths UI", () => {
  it("keeps gap rows visible after typed-signal normalization (keyword_gap)", () => {
    const inputs = keywordGapsToQueueInputs(
      ["pose camera", "guided poses"],
      "Snap Pose Camera",
      "com.example.pose",
    );

    const queueItems: OptimizationQueueItem[] = inputs.map((input, idx) => ({
      id: `gap-${idx}`,
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

    for (const item of queueItems) {
      expect(isCompetitorGapOpportunityItem(item)).toBe(true);
      // Bug regression: typed pill type becomes keyword_gap, not competitor_keyword
      expect(toTypedActiveContextSignal(item).type).toBe("keyword_gap");
    }

    const partitioned = partitionQueueForActiveContext(queueItems);
    expect(partitioned.competitorSpyPills).toHaveLength(2);
    expect(partitioned.reviewPills).toHaveLength(0);
    expect(partitioned.marketIntelPills).toHaveLength(0);

    // StagingWorkspaceSection must map ALL competitorSpyPills (no re-filter by typed type)
    const mapped = partitioned.competitorSpyPills.map((pill) => ({
      id: pill.id,
      keyword: pill.label,
      typedType: pill.item.type,
    }));
    expect(mapped.every((m) => m.typedType === "keyword_gap")).toBe(true);
    expect(mapped.map((m) => m.keyword)).toEqual(["pose camera", "guided poses"]);
  });
});
