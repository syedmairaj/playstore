import { describe, expect, it } from "vitest";
import {
  buildDailyAverageRankSeries,
  buildGrowthForecastPayload,
  buildProjectedTrendPoints,
  computeAvgDailyRankImprovement,
  computeEstimatedInstallVelocity,
  MIN_POST_DEPLOY_RANK_DAYS,
} from "@/lib/market/growth-forecast";

describe("growth-forecast", () => {
  const keywords = [{ id: "k1", market: "us" }];
  const snapshotsByKeyword = new Map([
    [
      "k1",
      [
        {
          keyword_id: "k1",
          rank: 40,
          snapshot_at: "2026-06-01T12:00:00.000Z",
          country_code: "us",
        },
        {
          keyword_id: "k1",
          rank: 30,
          snapshot_at: "2026-06-08T12:00:00.000Z",
          country_code: "us",
        },
        {
          keyword_id: "k1",
          rank: 20,
          snapshot_at: "2026-06-14T12:00:00.000Z",
          country_code: "us",
        },
      ],
    ],
  ]);

  it("buildDailyAverageRankSeries aggregates per-day ranks post-deployment", () => {
    const series = buildDailyAverageRankSeries({
      keywords,
      snapshotsByKeyword,
      deploymentIso: "2026-06-01T00:00:00.000Z",
      nowMs: Date.parse("2026-06-15T00:00:00.000Z"),
    });
    expect(series).toHaveLength(3);
    expect(series[0].avgRank).toBe(40);
    expect(series[2].avgRank).toBe(20);
  });

  it("computeAvgDailyRankImprovement returns positive when rank improves", () => {
    const series = [
      { date: "2026-06-01", avgRank: 40 },
      { date: "2026-06-08", avgRank: 20 },
    ];
    expect(computeAvgDailyRankImprovement(series)).toBeCloseTo(20 / 7, 2);
  });

  it("computeEstimatedInstallVelocity multiplies rank momentum by CVR", () => {
    expect(computeEstimatedInstallVelocity(2, 3.5)).toBe(7);
  });

  it("buildGrowthForecastPayload stays gathering below MIN_POST_DEPLOY_RANK_DAYS", () => {
    const payload = buildGrowthForecastPayload({
      series: [
        { date: "2026-06-01", avgRank: 40 },
        { date: "2026-06-02", avgRank: 38 },
      ],
      conversionRatePercent: 3.2,
    });
    expect(payload.status).toBe("gathering");
    expect(payload.postDeploymentDataDays).toBeLessThan(MIN_POST_DEPLOY_RANK_DAYS);
  });

  it("buildGrowthForecastPayload projects monthly installs when ready", () => {
    const series = Array.from({ length: 6 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, "0")}`,
      avgRank: 50 - i * 2,
    }));
    const payload = buildGrowthForecastPayload({
      series,
      conversionRatePercent: 4,
    });
    expect(payload.status).toBe("ready");
    expect(payload.projectedMonthlyInstalls).toBeGreaterThan(0);
    expect(payload.trendPoints).toHaveLength(7);
  });

  it("buildProjectedTrendPoints returns cumulative daily values", () => {
    expect(buildProjectedTrendPoints(2, 3)).toEqual([2, 4, 6]);
  });
});
