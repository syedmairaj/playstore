import { SERPER_RANK_NOT_IN_FIRST_PAGE } from "@/lib/keywords/serper-rank-constants";

/** Poll interval while Keyword Tracker / Competitor Spy rows await first Serper snapshot. */
export const KEYWORD_RANK_SYNC_POLL_INTERVAL_MS = 5000;

/** Max poll attempts (~60s) before giving up so UI never stays locked on “Syncing”. */
export const KEYWORD_RANK_SYNC_POLL_MAX_ATTEMPTS = 15;

export type KeywordRankSyncPollRow = {
  ranks?: { rank: number | null }[] | null;
  latestPerCountry?: unknown[] | null;
  lastSyncedAt?: string | null;
  latest?: { rank: number | null } | null;
};

/** Keyword row exists but no Serper snapshot yet (not the 101 “20+” sentinel). */
export function isKeywordRankSyncPending(row: KeywordRankSyncPollRow): boolean {
  if ((row.ranks?.length ?? 0) > 0) return false;
  if ((row.latestPerCountry?.length ?? 0) > 0) return false;
  if (row.lastSyncedAt) return false;
  const rank = row.latest?.rank;
  if (rank === SERPER_RANK_NOT_IN_FIRST_PAGE) return false;
  if (typeof rank === "number" && Number.isFinite(rank)) return false;
  return true;
}

export function isKeywordRankSyncComplete(row: KeywordRankSyncPollRow): boolean {
  return !isKeywordRankSyncPending(row);
}

export function rowsNeedingKeywordRankSyncPoll<T extends KeywordRankSyncPollRow>(
  rows: T[],
): T[] {
  return rows.filter(isKeywordRankSyncPending);
}
