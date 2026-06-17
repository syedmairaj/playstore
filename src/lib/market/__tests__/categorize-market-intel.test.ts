import { describe, expect, it } from "vitest";
import {
  buildMarketIntelligenceReport,
  computePriorityScore,
  migrateLegacySpotlight,
  sortByMarketPriority,
} from "@/lib/market/categorize-market-intel";

describe("categorize-market-intel", () => {
  it("prioritizes by search volume and conversion impact blend", () => {
    expect(computePriorityScore(80, 60)).toBeGreaterThan(computePriorityScore(50, 50));
    const sorted = sortByMarketPriority([
      { priorityScore: 40, id: "a" },
      { priorityScore: 90, id: "b" },
      { priorityScore: 65, id: "c" },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "c", "a"]);
  });

  it("migrates legacy spotlight into growth keywords and ux insights", () => {
    const report = migrateLegacySpotlight(
      {
        trendingKeywords: ["fitness tracker", "calorie counter"],
        narrative: "AI coaching dominates.",
        asoTip: "Add smart plan to title.",
      },
      { category: "HEALTH_AND_FITNESS", country: "us" },
    );

    expect(report.version).toBe(2);
    expect(report.growthKeywords).toHaveLength(2);
    expect(report.uxSentimentInsights).toHaveLength(2);
    expect(report.competitorThreats).toHaveLength(0);
    expect(report.growthKeywords[0].priorityScore).toBeGreaterThanOrEqual(
      report.growthKeywords[1].priorityScore,
    );
  });

  it("builds categorized report from model output", () => {
    const report = buildMarketIntelligenceReport(
      {
        growthKeywords: [
          { term: "workout planner", searchVolumeScore: 70, conversionImpactScore: 80 },
          { term: "step counter", searchVolumeScore: 90, conversionImpactScore: 55 },
        ],
        competitorThreats: [
          {
            term: "AI coach",
            competitorTitle: "FitPro",
            threatScore: 75,
            searchVolumeScore: 60,
            conversionImpactScore: 70,
          },
        ],
        uxSentimentInsights: [
          {
            headline: "Personalisation wave",
            body: "Users expect adaptive plans.",
            insightKind: "sentiment_theme",
          },
        ],
      },
      { category: "HEALTH_AND_FITNESS", country: "us" },
      [{ appId: "com.fitpro", title: "FitPro", rank: 2 }],
    );

    expect(report.growthKeywords[0].term).toBe("step counter");
    expect(report.competitorThreats[0].chartRank).toBe(2);
    expect(report.uxSentimentInsights[0].insightKind).toBe("sentiment_theme");
  });
});
