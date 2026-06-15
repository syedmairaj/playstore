import { describe, expect, it } from "vitest";
import {
  enrichStagingVaultMetadata,
  enforceActiveContextSectionBoundary,
  resolveActiveContextSection,
} from "@/lib/staging-vault/staging-vault-metadata";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";

describe("staging-vault-metadata", () => {
  it("enriches canonical JSONB fields for market intel signals", () => {
    const meta = enrichStagingVaultMetadata({
      signalType: "keyword",
      source: "keyword_spotlight",
      sourceContext: "keyword_spotlight",
      userSelected: true,
      confidenceScore: 0.9,
      metadata: { from_keyword_spotlight: true },
    });

    expect(meta.origin_module).toBe("market_intel");
    expect(meta.user_selected_boolean).toBe(true);
    expect(meta.confidence_score).toBe(0.9);
    expect(meta.active_context_section).toBe("opportunity");
  });

  it("forces review signals into review section even when miscategorized", () => {
    const section = enforceActiveContextSectionBoundary({
      signalType: "review_issue",
      source: "review_analysis",
      proposedSection: "opportunity",
    });
    expect(section).toBe("review");
  });

  it("prevents review queue items from resolving to opportunity category", () => {
    const category = resolveQueueItemCategory({
      type: "review_pain_point",
      source: "review_analysis",
      category: "opportunity",
      metadata: {
        active_context_section: "review",
        origin_module: "review_analysis",
      },
    });
    expect(category).toBe("review");
  });

  it("assigns market intel to opportunity section", () => {
    expect(
      resolveActiveContextSection({
        signalType: "keyword_gap",
        source: "market_intel",
      }),
    ).toBe("opportunity");
  });
});
