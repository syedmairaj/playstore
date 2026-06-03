/**
 * PostgREST fails the whole select when any column is unknown (e.g. migration not applied yet).
 * Prefer the full projection; fall back without ASO / badge columns when the DB is behind.
 */
export const KEYWORDS_SELECT_WITH_ASO_ROI =
  "id,term,market,locale,created_at,app_id,best_rank,recent_rank_gain,recent_rank_gain_at,last_listing_optimization_generation_id,last_listing_optimization_at,rank_at_last_listing_optimization,aso_baseline_rank,aso_baseline_captured_at" as const;

export const KEYWORDS_SELECT_WITHOUT_ASO_ROI =
  "id,term,market,locale,created_at,app_id,best_rank" as const;

export function isMissingColumnError(message: string, column: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes(column.toLowerCase()) &&
    (m.includes("does not exist") || m.includes("unknown") || m.includes("schema cache"))
  );
}

export function keywordsSelectFallbackForError(errMsg: string): typeof KEYWORDS_SELECT_WITH_ASO_ROI | typeof KEYWORDS_SELECT_WITHOUT_ASO_ROI {
  if (
    isMissingColumnError(errMsg, "recent_rank_gain") ||
    isMissingColumnError(errMsg, "recent_rank_gain_at") ||
    isMissingColumnError(errMsg, "aso_baseline_rank") ||
    isMissingColumnError(errMsg, "last_listing_optimization_generation_id")
  ) {
    return KEYWORDS_SELECT_WITHOUT_ASO_ROI;
  }
  return KEYWORDS_SELECT_WITH_ASO_ROI;
}
