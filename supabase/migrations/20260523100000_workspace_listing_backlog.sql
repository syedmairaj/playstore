-- ─────────────────────────────────────────────────────────────────────────────
-- workspace_listing_backlog
--
-- Persists IssueCard entries that a user adds to their optimisation queue via
-- the "Add to listing improvements" button in the Common Issues panel.
--
-- Each row represents one pain-point cluster that a workspace member wants to
-- act on.  Rows are keyed by workspace + package + country + title so duplicate
-- additions from the same analysis do not create multiple rows.
--
-- RLS policy:
--   SELECT / INSERT / DELETE — authenticated users who are members of the
--   workspace (resolved via the workspace_role() RPC to avoid recursive RLS).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.workspace_listing_backlog (
  id               uuid        primary key default gen_random_uuid(),

  -- Workspace scope
  workspace_id     uuid        not null references public.workspaces(id) on delete cascade,

  -- Source identifiers — which app + market this issue came from
  package_name     text        not null,
  country_code     text        not null default 'us',

  -- Issue payload — mirrors IssueItem from generate-review-analysis.ts
  issue_title      text        not null,
  issue_description text       not null,
  severity         text        not null default 'MEDIUM'
                               check (severity in ('CRITICAL', 'MEDIUM', 'LOW')),
  -- Stored as 0.0–1.0 fraction matching IssueItem.impact
  impact           numeric(5,4) not null default 0.0
                               check (impact >= 0.0 and impact <= 1.0),

  -- Who added it and when.
  -- Stored as plain uuid (no FK to auth.users) because Supabase restricts
  -- direct foreign key references from public schema tables to auth.users
  -- in projects with the default grants configuration.
  -- Ownership is still enforced at the RLS layer via auth.uid() comparison.
  added_by         uuid        not null default auth.uid(),
  created_at       timestamptz not null default now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

-- Fast per-workspace list (the primary query pattern: "show my backlog")
create index workspace_listing_backlog_workspace_idx
  on public.workspace_listing_backlog (workspace_id, created_at desc);

-- Deduplication check: one row per (workspace, package, country, title)
create unique index workspace_listing_backlog_dedup_idx
  on public.workspace_listing_backlog (workspace_id, package_name, country_code, issue_title);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table public.workspace_listing_backlog enable row level security;

-- Members of the workspace can read their own backlog rows
create policy "backlog_select_member"
  on public.workspace_listing_backlog
  for select
  using (
    (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
  );

-- Members can insert new backlog rows for their workspace
create policy "backlog_insert_member"
  on public.workspace_listing_backlog
  for insert
  with check (
    (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
    and added_by = auth.uid()
  );

-- Members can delete their own backlog rows
create policy "backlog_delete_own"
  on public.workspace_listing_backlog
  for delete
  using (
    added_by = auth.uid()
    and (select workspace_role(workspace_id)) in ('owner', 'admin', 'member')
  );
