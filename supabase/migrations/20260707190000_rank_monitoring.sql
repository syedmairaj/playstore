-- Rank monitoring queue — bridges Keyword Validator / Tracker to Wins Dashboard Live Rank Tracking.

create table if not exists public.rank_monitoring (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id       uuid not null references public.apps (id) on delete cascade,
  keyword_id   uuid not null references public.keywords (id) on delete cascade,
  market       text not null,
  status       text not null default 'tracking_pending'
    check (status in ('tracking_pending', 'active', 'paused')),
  source       text not null default 'keyword_validator',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists rank_monitoring_unique_idx
  on public.rank_monitoring (workspace_id, app_id, keyword_id, market);

create index if not exists rank_monitoring_workspace_app_idx
  on public.rank_monitoring (workspace_id, app_id, status);

alter table public.rank_monitoring enable row level security;

create policy "service_full_access" on public.rank_monitoring
  for all
  to service_role
  using (true)
  with check (true);

create policy "auth_read" on public.rank_monitoring
  for select
  to authenticated
  using (true);
