import { describe, expect, it } from "vitest";
import { buildMarketCaptureContext } from "@/lib/market-capture/market-capture-context";
import {
  applyApprovedStagedChanges,
  assembleMarketCaptureReport,
} from "@/lib/market-capture/market-capture-engine";

describe("market-capture-engine", () => {
  it("partitions queue into growth vs oppositional context", () => {
    const ctx = buildMarketCaptureContext({
      locale: "en",
      competitorName: "Rival",
      appName: "Our App",
      category: "Health",
      appFeatures: "Tracks fitness",
      queueItems: [
        {
          id: "1",
          type: "keyword_gap",
          category: "tracker",
          content: "fitness tracker",
          source: "keyword_tracker",
          language: "en",
          stagedAt: new Date().toISOString(),
          metadata: {},
        },
        {
          id: "2",
          type: "review_pain_point",
          category: "review",
          content: "Aggressive paywall",
          source: "review_analysis",
          language: "en",
          stagedAt: new Date().toISOString(),
          metadata: {},
        },
      ],
    });

    expect(ctx.growthKeywords).toContain("fitness tracker");
    expect(ctx.oppositionalPainPoints).toContain("Aggressive paywall");
  });

  it("builds staged changes without auto-approve", () => {
    const ctx = buildMarketCaptureContext({
      locale: "en",
      competitorName: "Rival",
      appName: "Our App",
      category: "Health",
      appFeatures: "Tracks fitness",
      queueItems: [],
      currentListing: { title: "Old Title" },
    });

    const report = assembleMarketCaptureReport(ctx, {
      versionA: {
        strategy: "oppositional",
        label: "Version A",
        title: {
          value: "FitTrack Pro",
          rationale: "Counters paywall pain with trust.",
          charCount: 12,
        },
        shortDescription: {
          value: "No upsells. Track goals daily.",
          rationale: "Conversion hook against rival friction.",
          charCount: 28,
        },
        fullDescription: {
          value: "• Reliable sync\n• Clean UI",
          rationale: "Bullet features with 2% density.",
          charCount: 25,
          keywordDensityPercent: 2.2,
        },
      },
      versionB: {
        strategy: "growth",
        label: "Version B",
        title: {
          value: "Fitness Tracker App",
          rationale: "High-volume head term.",
          charCount: 19,
        },
        shortDescription: {
          value: "Track workouts and hit fitness goals fast.",
          rationale: "Keyword-rich short hook.",
          charCount: 42,
        },
        fullDescription: {
          value: "• Workout logs\n• Step counter",
          rationale: "Intent keywords woven naturally.",
          charCount: 28,
          keywordDensityPercent: 2.8,
        },
      },
    });

    expect(report.stagedChanges.every((c) => c.status === "pending")).toBe(true);
    expect(report.stagedChanges.find((c) => c.id === "a-title")?.currentValue).toBe(
      "Old Title",
    );
  });

  it("applyApprovedStagedChanges merges only approved fields", () => {
    const merged = applyApprovedStagedChanges(
      [
        {
          id: "a-title",
          field: "title",
          version: "A",
          strategy: "oppositional",
          proposedValue: "New Title",
          rationale: "test",
          charCount: 9,
          status: "approved",
        },
        {
          id: "b-shortDescription",
          field: "shortDescription",
          version: "B",
          strategy: "growth",
          proposedValue: "Short hook",
          rationale: "test",
          charCount: 10,
          status: "rejected",
        },
      ],
      { title: "Old" },
    );

    expect(merged.title).toBe("New Title");
    expect(merged.shortDescription).toBeUndefined();
  });
});
