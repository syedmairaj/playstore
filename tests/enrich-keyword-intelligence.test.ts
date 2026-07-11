import { describe, expect, it } from "vitest";
import {
  enrichKeywordIntelligence,
  estimateRelevanceMatch,
  isQuickWinKeyword,
} from "@/lib/listing/enrich-keyword-intelligence";

describe("enrichKeywordIntelligence", () => {
  it("merges tracker volume/difficulty with parsed keyword categories", () => {
    const items = enrichKeywordIntelligence({
      keywordSuggestions: [
        "[competitive] salt tracker app",
        "[gap] no ads glucose log",
      ],
      appFeatures: "Track salt and sugar intake daily",
      category: "Health & Fitness",
      trackedKeywordSignals: [
        { keyword: "salt tracker app", searchVolume: 6200, difficulty: 45 },
      ],
      modelIntelligence: [
        {
          keyword: "no ads glucose log",
          cluster: "gap",
          searchVolume: 2400,
          difficultyScore: 22,
          relevanceMatch: 82,
          roiRationale: "Competitor-gap term for ad-free logging.",
        },
      ],
    });

    expect(items).toHaveLength(2);

    const competitive = items.find((i) => i.keyword === "salt tracker app");
    expect(competitive?.cluster).toBe("competitive");
    expect(competitive?.searchVolume).toBe(6200);
    expect(competitive?.difficultyScore).toBe(45);

    const gap = items.find((i) => i.keyword === "no ads glucose log");
    expect(gap?.roiRationale).toContain("Competitor-gap");
    expect(isQuickWinKeyword(gap!)).toBe(true);
  });

  it("estimates relevance from app features overlap", () => {
    const high = estimateRelevanceMatch(
      "salt sugar tracker",
      "Track salt and sugar daily",
      "Health",
    );
    const low = estimateRelevanceMatch(
      "flight booking deals",
      "Track salt and sugar daily",
      "Health",
    );
    expect(high).toBeGreaterThan(low);
  });
});
