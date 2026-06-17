import { describe, expect, it } from "vitest";
import {
  buildCompetitiveEdgeReport,
  mapPainToCounterFeature,
} from "@/lib/competitor-spy/competitive-edge-report";

describe("competitive-edge-report", () => {
  it("maps paywall pain to shortDescription counter-feature", () => {
    const mapped = mapPainToCounterFeature("Aggressive paywall blocks features", "en");
    expect(mapped.listingPlacement).toBe("shortDescription");
    expect(mapped.counterFeature.toLowerCase()).toContain("pricing");
  });

  it("builds structured report with three optimizer categories", () => {
    const report = buildCompetitiveEdgeReport({
      locale: "en",
      competitor: {
        id: "1",
        query: "fitness tracker",
        displayName: "Rival Fit",
        packageId: "com.rival.fit",
        topKeywords: ["fitness", "workouts"],
        shared: [{ keyword: "fitness", yourRank: 3, theirRank: 9 }],
        quickWins: [],
        quickWinTerms: ["offline mode"],
        gaps: [{ keyword: "meal tracker", opportunity: "high" }],
        sentiment: {
          topPraiseKeywords: ["barcode scanner works", "easy to use"],
          reportedBugsKeywords: ["constant upsell popups"],
          featureRequestsKeywords: ["apple watch sync"],
        },
        asoAudit: {
          domainAuthority: 28,
          hasVideoTrailer: false,
          localizedMarketsCount: 1,
        },
      },
    });

    expect(report.keywordsToCapture.length).toBeGreaterThan(0);
    expect(report.competitorWeaknessesToExploit.length).toBeGreaterThan(0);
    expect(report.assetOpportunities.some((a) => a.gap.includes("video"))).toBe(true);
    expect(report.optimizerBrief).toContain("Keywords to Capture");
    expect(report.reviewIntelligence.praise.length).toBeGreaterThan(0);
    expect(report.reviewIntelligence.praiseBaseline?.length).toBeGreaterThan(0);
  });
});
