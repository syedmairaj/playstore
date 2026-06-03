-- ─────────────────────────────────────────────────────────────────────────────
-- competitor_insights
-- Caches Gemini-generated Common Issues analysis for a
-- (workspace_id, package_name, lang_code) triple.
--
-- Rows are upserted (not inserted) so each unique triple has exactly one live
-- cache entry at any time.  The `updated_at` timestamp drives cache-bust logic
-- in the API route (re-analyse if row is older than N hours).
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop any partial table from a previously failed migration run.
drop table if exists public.competitor_insights cascade;

create table public.competitor_insights (
  id            uuid primary key default gen_random_uuid(),

  -- Workspace that owns this analysis (FK + cascade delete for cleanup)
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,

  -- Android package identifier, e.g. "com.myfitnesspal.app" or the workspace's
  -- own package name.  Stored as-is from the Play Store scraper.
  package_name  text not null,

  -- BCP-47 language tag used for the scraper pass that produced these reviews.
  -- e.g. "en", "ar".  Part of the unique cache key so English and Arabic
  -- insights for the same package are stored independently.
  lang_code     text not null default 'en',

  -- Serialised IssueItem[] array from generateReviewAnalysis().
  -- Schema mirrors the TypeScript IssueItem type:
  --   [{ title, description, severity, impact, quote }, ...]
  insights      jsonb not null default '[]'::jsonb,

  -- ISO-8601 timestamp of the last successful Gemini run.
  -- Used to determine cache freshness (API route re-runs if too old).
  updated_at    timestamptz not null default now(),

  -- One row per (workspace × package × lang) triple.
  constraint competitor_insights_workspace_pkg_lang_key
    unique (workspace_id, package_name, lang_code)
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary lookup: fetch cached analysis for a given workspace + package + lang
create index competitor_insights_workspace_pkg_lang_idx
  on public.competitor_insights (workspace_id, package_name, lang_code);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table public.competitor_insights enable row level security;

-- Workspace members may read any insight row belonging to their workspace.
-- Matches the 1-argument is_workspace_member(uuid) signature used throughout
-- this project (see workspace_competitor_analyses and other tables).
create policy "workspace_members_select_insights"
  on public.competitor_insights
  for select
  using (
    public.is_workspace_member(workspace_id)
  );

-- Workspace members may insert / update their own workspace's insights.
create policy "workspace_members_write_insights"
  on public.competitor_insights
  for insert
  with check (
    public.is_workspace_member(workspace_id)
  );

create policy "workspace_members_update_insights"
  on public.competitor_insights
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_delete_insights"
  on public.competitor_insights
  for delete
  using (public.is_workspace_member(workspace_id));
