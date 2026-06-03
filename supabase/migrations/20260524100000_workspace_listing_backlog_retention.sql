-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_listing_backlog — data retention schema additions
--
-- Adds two columns required for the automated cleanup system:
--
--   is_implemented  boolean — set to TRUE by the user (or a future UI action)
--                             once an optimisation has been shipped to the store.
--   updated_at      timestamptz — auto-updated by a BEFORE-UPDATE trigger so
--                                 the cleanup function can compare against a
--                                 meaningful modification timestamp.
--
-- Retention policy (enforced by cleanup_expired_backlog_items):
--   Implemented rows  → purged 30 days after last update
--   Unimplemented rows → purged 90 days after last update (draft protection)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. New columns ────────────────────────────────────────────────────────────

alter table public.workspace_listing_backlog
  add column if not exists is_implemented boolean not null default false;

alter table public.workspace_listing_backlog
  add column if not exists updated_at timestamptz not null
    default timezone('utc'::text, now());

-- ── 2. Auto-update trigger — keeps updated_at current on every UPDATE ─────────

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := timezone('utc'::text, now());
  return new;
end;
$$;

-- Idempotent: drop the trigger first so re-running the migration is safe.
drop trigger if exists trg_backlog_updated_at on public.workspace_listing_backlog;

create trigger trg_backlog_updated_at
  before update on public.workspace_listing_backlog
  for each row
  execute function public.set_updated_at();

-- ── 3. Composite index — makes batch deletions instant without table locks ────
--
-- The cleanup function filters on (is_implemented, updated_at) in its WHERE
-- clause.  This index lets Postgres do an index-only scan on both conditions
-- simultaneously rather than a sequential scan of the full table.

create index if not exists idx_backlog_cleanup_lookup
  on public.workspace_listing_backlog (is_implemented, updated_at);

-- ── 4. Cleanup function ───────────────────────────────────────────────────────
--
-- cleanup_expired_backlog_items()
--
-- Deletes rows according to two retention rules:
--   Rule A — Completed/Implemented: is_implemented = TRUE and updated_at older
--             than 30 days.  Historical reference window; short because the
--             insight is no longer actionable once shipped.
--   Rule B — Stale Drafts: is_implemented = FALSE and updated_at older than
--             90 days.  Long window gives users a full quarter to act on ideas
--             without losing them to aggressive cleanup.
--
-- Returns a JSON summary: { "implemented_deleted": N, "draft_deleted": N }
-- so the cron caller can log exactly how many rows were pruned.
--
-- SECURITY DEFINER is intentionally omitted — this function runs with the
-- caller's role (service_role in the cron route) which already bypasses RLS.

create or replace function public.cleanup_expired_backlog_items()
  returns json
  language plpgsql
as $$
declare
  v_implemented_deleted integer := 0;
  v_draft_deleted       integer := 0;
begin
  -- Rule A: implemented tasks older than 30 days
  with deleted as (
    delete from public.workspace_listing_backlog
    where is_implemented = true
      and updated_at < timezone('utc'::text, now()) - interval '30 days'
    returning id
  )
  select count(*) into v_implemented_deleted from deleted;

  -- Rule B: unimplemented drafts older than 90 days
  with deleted as (
    delete from public.workspace_listing_backlog
    where is_implemented = false
      and updated_at < timezone('utc'::text, now()) - interval '90 days'
    returning id
  )
  select count(*) into v_draft_deleted from deleted;

  return json_build_object(
    'implemented_deleted', v_implemented_deleted,
    'draft_deleted',       v_draft_deleted
  );
end;
$$;
