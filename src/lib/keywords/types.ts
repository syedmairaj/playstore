/**
 * Keyword Tracker DB shapes (see migration `20260514120000_keyword_rank_snapshots.sql`).
 * API responses may alias `snapshot_at` as `captured_at` for backward compatibility.
 */

export type KeywordRankSnapshot = {
  id: string;
  keyword_id: string;
  rank: number;
  best_rank: number;
  search_volume: number | null;
  snapshot_at: string;
  created_at: string;
  source: string;
  /** Play market (lowercase alpha-2); null on legacy or manual rows. */
  country_code: string | null;
};

/** Row shape for inserts (server fills best_rank via trigger if omitted in SQL; client inserts rank only). */
export type KeywordRankSnapshotInsert = {
  keyword_id: string;
  rank: number;
  snapshot_at?: string;
  search_volume?: number | null;
  source?: string;
  country_code?: string | null;
};
