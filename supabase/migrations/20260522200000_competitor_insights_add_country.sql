-- ─────────────────────────────────────────────────────────────────────────────
-- competitor_insights — add country column + update composite unique constraint
--
-- The original migration keyed the cache on (workspace_id, package_name,
-- lang_code).  Country is now added as a first-class dimension so that the
-- same package analysed in different markets (e.g. "us" vs "ae") produces
-- independent cache slots with their own Gemini results.
--
-- Composite unique key after this migration:
--   (workspace_id, package_name, lang_code, country)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add the country column (ISO 3166-1 alpha-2, lowercase).
--    Default "us" keeps all existing rows valid without a backfill.
alter table public.competitor_insights
  add column if not exists country text not null default 'us';

-- 2. Drop the old 3-column unique constraint.
alter table public.competitor_insights
  drop constraint if exists competitor_insights_workspace_pkg_lang_key;

-- 3. Add the new 4-column unique constraint.
alter table public.competitor_insights
  add constraint competitor_insights_workspace_pkg_lang_country_key
    unique (workspace_id, package_name, lang_code, country);

-- 4. Replace the 3-column lookup index with a 4-column one.
drop index if exists competitor_insights_workspace_pkg_lang_idx;

create index competitor_insights_workspace_pkg_lang_country_idx
  on public.competitor_insights (workspace_id, package_name, lang_code, country);
