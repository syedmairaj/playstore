/**
 * Stored in `keyword_rank_snapshots.rank` when the app is not in the organic slice
 * returned for that Serper request. Preview uses `num: 20`; keyword refresh uses
 * `num: 100` — both map “not found” to this sentinel. Shared by server routes and UI.
 */
export const SERPER_RANK_NOT_IN_FIRST_PAGE = 101;
