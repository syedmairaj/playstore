-- Learned Play Store package ids from live Serper title/package matching.
-- Priority at refresh time: canonical_package_id → serp_matched_package_id → package_name.

alter table public.apps
  add column if not exists serp_matched_package_id text null;

comment on column public.apps.serp_matched_package_id is
  'Package id learned from a successful Serper title match. Used for direct SERP lookups on future refreshes.';

alter table public.workspace_competitor_analyses
  add column if not exists serp_matched_package_id text null;

comment on column public.workspace_competitor_analyses.serp_matched_package_id is
  'Package id learned from a successful Serper title match for this competitor slot.';

alter table public.keyword_rank_snapshots
  add column if not exists rank_match_kind text,
  add column if not exists competitor_1_match_kind text,
  add column if not exists competitor_2_match_kind text;

comment on column public.keyword_rank_snapshots.rank_match_kind is
  'How your_app rank was resolved: package | title | none. Drives Pending vs 50+ UI.';

comment on column public.keyword_rank_snapshots.competitor_1_match_kind is
  'Match kind for competitor slot 1 at snapshot time (package | title | none).';

comment on column public.keyword_rank_snapshots.competitor_2_match_kind is
  'Match kind for competitor slot 2 at snapshot time (package | title | none).';

alter table public.apps
  drop constraint if exists apps_serp_matched_package_id_len;

alter table public.apps
  add constraint apps_serp_matched_package_id_len
  check (
    serp_matched_package_id is null
    or char_length(trim(serp_matched_package_id)) between 3 and 256
  );

alter table public.workspace_competitor_analyses
  drop constraint if exists workspace_competitor_analyses_serp_matched_package_len;

alter table public.workspace_competitor_analyses
  add constraint workspace_competitor_analyses_serp_matched_package_len
  check (
    serp_matched_package_id is null
    or char_length(trim(serp_matched_package_id)) between 3 and 256
  );

alter table public.keyword_rank_snapshots
  drop constraint if exists keyword_rank_snapshots_rank_match_kind_chk;

alter table public.keyword_rank_snapshots
  add constraint keyword_rank_snapshots_rank_match_kind_chk
  check (rank_match_kind is null or rank_match_kind in ('package', 'title', 'none'));
