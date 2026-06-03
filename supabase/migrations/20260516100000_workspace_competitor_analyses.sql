-- Competitor Spy: persisted analyses per workspace (source of truth; sessionStorage is optional cache).

create table if not exists public.workspace_competitor_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  competitor_package_id text not null,
  competitor_name text not null,
  category text,
  icon_url text,
  analysis_json jsonb not null default '{}'::jsonb,
  countries text[] not null default '{}',
  analyzed_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_competitor_analyses_package_len check (char_length(competitor_package_id) between 3 and 256),
  constraint workspace_competitor_analyses_name_len check (char_length(competitor_name) between 1 and 512),
  unique (workspace_id, competitor_package_id)
);

create index if not exists workspace_competitor_analyses_workspace_idx
  on public.workspace_competitor_analyses (workspace_id, analyzed_at desc);

comment on table public.workspace_competitor_analyses is
  'Competitor Spy saved analyses (gaps, shared keywords, quick wins, optional Serper preview snapshot). RLS: workspace members.';

alter table public.workspace_competitor_analyses enable row level security;

create policy "workspace_competitor_analyses_select_member"
  on public.workspace_competitor_analyses for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_competitor_analyses_insert_member"
  on public.workspace_competitor_analyses for insert
  with check (
    public.is_workspace_member(workspace_id)
    and created_by = auth.uid()
  );

create policy "workspace_competitor_analyses_update_member"
  on public.workspace_competitor_analyses for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_competitor_analyses_delete_member"
  on public.workspace_competitor_analyses for delete
  using (public.is_workspace_member(workspace_id));
