-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_asset_manifests
--
-- Binds a listing-pipeline vault state (identified by workspace + app + locale
-- + queue_hash) to the current set of approved visual assets (icon, banner,
-- screenshots).  One row per unique (workspace, app, locale, queue_hash)
-- combination — upserted each time the text pipeline completes.
--
-- sync_status lifecycle:
--   pending  → manifest row was created but text/visual alignment has not yet
--              been evaluated (e.g. no screenshots approved yet).
--   synced   → detected_text_archetype matches approved_visual_archetype, or
--              no approved visual archetype is set (neutral).
--   mismatch → the text pipeline detected a different value-prop archetype
--              than the currently approved screenshot set.  A warning (not a
--              hard block) is surfaced to the user at generate time.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_asset_manifests (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Ownership
  workspace_id              uuid not null references public.workspaces (id) on delete cascade,
  app_id                    uuid references public.apps (id) on delete cascade,

  -- Vault anchor — ties this manifest to a specific optimisation-queue state
  vault_locale              text not null check (vault_locale in ('en', 'ar')),
  queue_hash                text not null,

  -- ── Visual asset pointers ──────────────────────────────────────────────────
  -- Nullable foreign keys: set when the user has approved that asset type.
  icon_asset_id             uuid references public.brand_assets (id) on delete set null,
  banner_asset_id           uuid references public.brand_assets (id) on delete set null,
  -- screenshot_jobs.batch_id is not a primary key so we store it as text.
  screenshot_batch_id       text,

  -- ── Archetype alignment ────────────────────────────────────────────────────
  -- Detected from the text pipeline output (title + short + features keywords).
  -- Values: teams | productivity | entertainment | health | finance |
  --         education | social | generic
  detected_text_archetype   text,

  -- Set by the user (or inferred) when screenshots are approved.
  approved_visual_archetype text,

  -- Visual / text alignment state (see lifecycle comment above).
  sync_status               text not null default 'pending'
    check (sync_status in ('pending', 'synced', 'mismatch')),

  -- When the last sync evaluation ran.
  synced_at                 timestamptz
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Primary lookup: manifest for a specific vault state (app_id may be NULL).
create unique index if not exists workspace_asset_manifests_uq_with_app
  on public.workspace_asset_manifests (workspace_id, app_id, vault_locale, queue_hash)
  where app_id is not null;

create unique index if not exists workspace_asset_manifests_uq_null_app
  on public.workspace_asset_manifests (workspace_id, vault_locale, queue_hash)
  where app_id is null;

-- List all manifests for a workspace (dashboard / health view).
create index if not exists workspace_asset_manifests_workspace_idx
  on public.workspace_asset_manifests (workspace_id, updated_at desc);

-- Fast filter by sync status (e.g. detect mismatches across workspace).
create index if not exists workspace_asset_manifests_sync_status_idx
  on public.workspace_asset_manifests (workspace_id, sync_status)
  where sync_status = 'mismatch';

-- ── Auto-update updated_at ────────────────────────────────────────────────────

create or replace function public.workspace_asset_manifests_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_asset_manifests_updated_at_trg
  on public.workspace_asset_manifests;

create trigger workspace_asset_manifests_updated_at_trg
  before update on public.workspace_asset_manifests
  for each row execute function public.workspace_asset_manifests_updated_at();

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table public.workspace_asset_manifests enable row level security;

create policy "workspace_asset_manifests_select_member"
  on public.workspace_asset_manifests
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- All writes go through service role (API routes / workers).
-- No direct INSERT/UPDATE policies for authenticated role.

-- ── Comments ──────────────────────────────────────────────────────────────────

comment on table public.workspace_asset_manifests is
  'Visual/text alignment state for each listing pipeline run.  One row per '
  '(workspace, app, locale, queue_hash).  Upserted by the generation worker; '
  'read by POST /api/listings/generate to surface visual_text_mismatch warnings.';

comment on column public.workspace_asset_manifests.detected_text_archetype is
  'Visual archetype inferred from generated title + short description + features '
  'keywords.  One of: teams | productivity | entertainment | health | finance | '
  'education | social | generic.';

comment on column public.workspace_asset_manifests.approved_visual_archetype is
  'Archetype of the currently approved screenshot set.  Set when a screenshot '
  'batch is approved by the user.  NULL = no approved screenshots yet.';

comment on column public.workspace_asset_manifests.sync_status is
  'pending | synced | mismatch.  Mismatch triggers a non-blocking warning at '
  'generate time so users know their screenshots may not match the new listing copy.';
