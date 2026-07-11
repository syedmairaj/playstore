/** Keyword rank win — improved ≥ MIN_RANK_WIN_POSITIONS since last deployment. */
export type KeywordRankWin = {
  keywordId: string;
  term: string;
  market: string;
  rankAtDeployment: number;
  currentRank: number;
  positionsGained: number;
  /** ISO timestamp of the baseline Serper snapshot used for deployment rank. */
  baselineSnapshotAt: string | null;
  /** ISO timestamp of the latest Serper snapshot used for current rank. */
  currentSnapshotAt: string | null;
};

export type RankProgressResult = {
  appId: string;
  deploymentDate: string | null;
  deploymentVersionNumber: number | null;
  deploymentVersionId: string | null;
  wins: KeywordRankWin[];
  trackedKeywordCount: number;
};
