import { describe, expect, it } from "vitest";
import {
  GENERATION_READINESS_REASON,
  validateGenerationReadiness,
} from "@/lib/utils/listing-guardrails";
import type { OptimizationQueueItem } from "@/lib/optimization-queue";

const sampleItem: OptimizationQueueItem = {
  id: "oq-1",
  type: "review_pain_point",
  category: "review",
  content: "Paywall blocks core features",
  source: "competitor_spy",
  language: "en",
  stagedAt: new Date().toISOString(),
  metadata: {},
};

describe("validateGenerationReadiness", () => {
  it("blocks generation when the optimization queue is empty", () => {
    expect(validateGenerationReadiness([])).toEqual({
      isReady: false,
      reason: GENERATION_READINESS_REASON.EMPTY_QUEUE,
      suggestedAction: "AUTO_STAGE",
    });
  });

  it("allows generation when at least one queue item is staged", () => {
    expect(validateGenerationReadiness([sampleItem])).toEqual({
      isReady: true,
      reason: null,
      suggestedAction: null,
    });
  });
});
