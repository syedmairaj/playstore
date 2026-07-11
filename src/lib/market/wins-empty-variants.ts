import type { GrowthForecastResult } from "@/lib/market/growth-forecast.types";
import { MIN_POST_DEPLOY_RANK_DAYS } from "@/lib/market/growth-forecast";
import type { RankProgressResult } from "@/lib/market/rank-progress.types";
import { MIN_RANK_WIN_POSITIONS } from "@/lib/market/rank-progress";

export type WinsEmptyVariant =
  | "noDeployment"
  | "noKeywords"
  | "awaitingWins";

export type ForecastEmptyVariant =
  | "needRankHistory"
  | "needConversionRate"
  | "flatMomentum";

export function resolveWinsEmptyVariant(
  progress: RankProgressResult,
): WinsEmptyVariant {
  if (!progress.deploymentDate) return "noDeployment";
  if (progress.trackedKeywordCount === 0) return "noKeywords";
  return "awaitingWins";
}

export function resolveForecastEmptyVariant(
  forecast: GrowthForecastResult,
): ForecastEmptyVariant {
  if (forecast.postDeploymentDataDays < MIN_POST_DEPLOY_RANK_DAYS) {
    return "needRankHistory";
  }
  if (
    forecast.conversionRatePercent == null ||
    forecast.conversionRatePercent <= 0
  ) {
    return "needConversionRate";
  }
  return "flatMomentum";
}

export { MIN_RANK_WIN_POSITIONS, MIN_POST_DEPLOY_RANK_DAYS };
