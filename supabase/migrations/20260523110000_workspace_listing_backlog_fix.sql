-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: drop partially-created workspace_listing_backlog and recreate cleanly.
--
-- The previous migration failed because Supabase restricts direct FK references
-- from public schema tables to auth.users in the default grants configuration.
-- added_by is now a plain uuid with a default of auth.uid() — ownership is
-- still enforced at the RLS layer via auth.uid() comparison in policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop everything from the failed migration attempt
drop table if exists public.workspace_listing_backlog cascade;

-- Recreate cleanly
create table public.workspace_listing_backlog (
  id                uuid         primary key default gen_random_uuid(),
  workspace_id      uuid         not null references public.workspaces(id) on delete cascade,
  package_name      text         not null,
  country_code      text         not null default 'us',
  issue_title       text         not null,
  issue_description text         not null,
  severity          text         not null default 'MEDIUM'
                                 check (severity in ('CRITICAL', 'MEDIUM', 'LOW')),
  impact            numeric(5,4) not null default 0.0
                                 check (impact >= 0.0 and impact <= 1.0),
  added_by          uuid         not null default auth.uid(),
  created_at        timestamptz  not null default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index workspace_listing_backlog_workspace_idx
  on public.workspace_listing_backlog (workspace_id, created_at desc);

create unique index workspace_listing_backlog_dedup_idx
  on public.workspace_listing_backlog (workspace_id, package_name, country_code, issue_title);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.workspace_listing_backlog enable row level security;

create policy "backlog_select_member"
  on public.workspace_listing_backlog
  for select
  using (
    (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
  );

create policy "backlog_insert_member"
  on public.workspace_listing_backlog
  for insert
  with check (
    (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
    and added_by = auth.uid()
  );

create policy "backlog_delete_own"
  on public.workspace_listing_backlog
  for delete
  using (
    added_by = auth.uid()
    and (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
  );
