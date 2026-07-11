export type KeywordRankCorrelation = {
  keywordId: string;
  term: string;
  market: string;
  preDeploymentRank: number | null;
  currentRank: number | null;
  /** Positive = market rank improved (lower position number). */
  rankChange: number | null;
  searchVolume: number | null;
  isHighVolume: boolean;
  /** Daily market ranks for the last 7 days (oldest → newest). Null = no snapshot that day. */
  sparkline7d: (number | null)[];
  /** Rank monitoring queue status from `rank_monitoring`, when enrolled. */
  monitoringStatus?: "tracking_pending" | "active" | "paused" | null;
};

export type PerformanceAlert = {
  keywordId: string;
  term: string;
  positionsDropped: number;
};

export type LiveRankTrackingResult = {
  rows: KeywordRankCorrelation[];
  alerts: PerformanceAlert[];
  /** Total tracked keywords resolved (Keyword Tracker parity). */
  keywordCount: number;
  hasDeployment: boolean;
  keywordScope: "app" | "workspace";
};
