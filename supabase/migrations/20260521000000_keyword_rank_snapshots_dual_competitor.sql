-- Dual Competitor Rank columns on keyword_rank_snapshots.
-- Records the 2-slot competitor package IDs and their resolved Play Store rank positions
-- at the moment of each Serper refresh so the Keyword Tracker table can show both rivals
-- without a second JOIN to workspace_competitor_analyses.
--
-- Design notes:
--   • competitor_1_package / competitor_2_package  = the package ID string resolved at
--     refresh time (denormalised snapshot of workspace_competitor_analyses row).
--   • competitor_1_rank / competitor_2_rank         = TEXT so we can store either a numeric
--     string rank ("7") or the display sentinel "100+" when the app was not found in the
--     first 100 organic results.  NULL = slot was empty / competitor not tracked at this
--     point in time.
--   • All four columns are nullable — existing rows keep NULL and the UI degrades
--     gracefully to the "—" placeholder.

alter table public.keyword_rank_snapshots
  add column if not exists competitor_1_package text,
  add column if not exists competitor_1_rank     text,
  add column if not exists competitor_2_package text,
  add column if not exists competitor_2_rank     text;

comment on column public.keyword_rank_snapshots.competitor_1_package is
  'Android package ID of the first tracked competitor at the time of this Serper snapshot.';

comment on column public.keyword_rank_snapshots.competitor_1_rank is
  'Organic Play Store rank of competitor_1_package for this keyword/country snapshot. ''"100+"'' when not in top 100; NULL when slot was empty.';

comment on column public.keyword_rank_snapshots.competitor_2_package is
  'Android package ID of the second tracked competitor at the time of this Serper snapshot.';

comment on column public.keyword_rank_snapshots.competitor_2_rank is
  'Organic Play Store rank of competitor_2_package for this keyword/country snapshot. ''"100+"'' when not in top 100; NULL when slot was empty.';

-- Sparse index: only covers rows where we actually tracked a competitor.
create index if not exists keyword_rank_snapshots_comp1_pkg_idx
  on public.keyword_rank_snapshots (competitor_1_package)
  where competitor_1_package is not null;

create index if not exists keyword_rank_snapshots_comp2_pkg_idx
  on public.keyword_rank_snapshots (competitor_2_package)
  where competitor_2_package is not null;
