-- Canonical Play Store package ids for live Serper rank lookups.
--
-- Migration plan:
--   1. Apply this migration (adds nullable columns; no data backfill required).
--   2. For each workspace app used in Keyword Tracker / Validator, set
--      apps.canonical_package_id to the production Play Store id
--      (e.g. com.myfitnesspal.android) while keeping package_name as the
--      internal/test identifier (e.g. com.example.saltsugar).
--   3. For each Competitor Spy slot, set workspace_competitor_analyses.canonical_package_id
--      to the live competitor id when competitor_package_id is a workspace alias.
--   4. Re-run serper-refresh — logs will show "Match Found" when canonical ids align
--      with Serper SERP package ids.
--
-- Serper rank resolution prioritizes canonical_package_id over package_name /
-- competitor_package_id for SERP matching only; internal ids remain the workspace key.

alter table public.apps
  add column if not exists canonical_package_id text null;

comment on column public.apps.canonical_package_id is
  'Production Play Store application id for live Serper rank lookups. When set, rank resolution matches this id against Serper results instead of package_name.';

alter table public.workspace_competitor_analyses
  add column if not exists canonical_package_id text null;

comment on column public.workspace_competitor_analyses.canonical_package_id is
  'Production Play Store application id for live Serper competitor rank lookups. competitor_package_id remains the workspace identity key.';

alter table public.apps
  drop constraint if exists apps_canonical_package_id_len;

alter table public.apps
  add constraint apps_canonical_package_id_len
  check (
    canonical_package_id is null
    or char_length(trim(canonical_package_id)) between 3 and 256
  );

alter table public.workspace_competitor_analyses
  drop constraint if exists workspace_competitor_analyses_canonical_package_len;

alter table public.workspace_competitor_analyses
  add constraint workspace_competitor_analyses_canonical_package_len
  check (
    canonical_package_id is null
    or char_length(trim(canonical_package_id)) between 3 and 256
  );
