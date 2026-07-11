export type GrowthForecastStatus = "ready" | "gathering";

export type GrowthForecastResult = {
  status: GrowthForecastStatus;
  /** Distinct calendar days with post-deployment Serper rank data in the lookback window. */
  postDeploymentDataDays: number;
  /** Average positions gained per day (lower rank number = better). */
  avgDailyRankImprovement: number | null;
  /** Latest app conversion rate (%) from listing metrics. */
  conversionRatePercent: number | null;
  /** avgDailyRankImprovement × conversionRatePercent */
  estimatedInstallVelocity: number | null;
  /** Projected installs over 30 days if momentum continues. */
  projectedMonthlyInstalls: number | null;
  /** Seven projected cumulative install values for the trend sparkline (days 1–7). */
  trendPoints: number[];
};

export const GATHERING_FORECAST: GrowthForecastResult = {
  status: "gathering",
  postDeploymentDataDays: 0,
  avgDailyRankImprovement: null,
  conversionRatePercent: null,
  estimatedInstallVelocity: null,
  projectedMonthlyInstalls: null,
  trendPoints: [],
};
