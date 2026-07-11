import { describe, expect, it } from "vitest";
import {
  resolveForecastEmptyVariant,
  resolveWinsEmptyVariant,
} from "@/lib/market/wins-empty-variants";
import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import type { RankProgressResult } from "@/lib/market/rank-progress.types";

function progress(overrides: Partial<RankProgressResult> = {}): RankProgressResult {
  return {
    appId: "app-1",
    deploymentDate: "2026-06-01T00:00:00.000Z",
    deploymentVersionNumber: 1,
    deploymentVersionId: "ver-1",
    trackedKeywordCount: 3,
    wins: [],
    ...overrides,
  };
}

function forecast(overrides: Partial<GrowthForecastResult> = {}): GrowthForecastResult {
  return {
    status: "gathering",
    postDeploymentDataDays: 0,
    avgDailyRankImprovement: null,
    conversionRatePercent: null,
    estimatedInstallVelocity: null,
    projectedMonthlyInstalls: null,
    trendPoints: [],
    ...overrides,
  };
}

describe("wins-empty-variants", () => {
  it("resolveWinsEmptyVariant prioritizes missing deployment", () => {
    expect(resolveWinsEmptyVariant(progress({ deploymentDate: null }))).toBe(
      "noDeployment",
    );
  });

  it("resolveWinsEmptyVariant detects no tracked keywords", () => {
    expect(
      resolveWinsEmptyVariant(
        progress({ deploymentDate: "2026-06-01", trackedKeywordCount: 0 }),
      ),
    ).toBe("noKeywords");
  });

  it("resolveWinsEmptyVariant falls back to awaitingWins", () => {
    expect(resolveWinsEmptyVariant(progress())).toBe("awaitingWins");
  });

  it("resolveForecastEmptyVariant prioritizes rank history threshold", () => {
    expect(resolveForecastEmptyVariant(forecast({ postDeploymentDataDays: 2 }))).toBe(
      "needRankHistory",
    );
  });

  it("resolveForecastEmptyVariant detects missing conversion rate", () => {
    expect(
      resolveForecastEmptyVariant(
        forecast({ postDeploymentDataDays: 6, conversionRatePercent: null }),
      ),
    ).toBe("needConversionRate");
    expect(
      resolveForecastEmptyVariant(
        forecast({ postDeploymentDataDays: 6, conversionRatePercent: 0 }),
      ),
    ).toBe("needConversionRate");
  });

  it("resolveForecastEmptyVariant falls back to flatMomentum", () => {
    expect(
      resolveForecastEmptyVariant(
        forecast({ postDeploymentDataDays: 6, conversionRatePercent: 4.2 }),
      ),
    ).toBe("flatMomentum");
  });
});
