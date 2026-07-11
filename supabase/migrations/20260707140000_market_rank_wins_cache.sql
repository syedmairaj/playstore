-- ─────────────────────────────────────────────────────────────────────────────
-- market_rank_wins_cache
--
-- Pre-computed Wins Dashboard + Growth Forecast payload per workspace/app.
-- TTL 6 hours — aligns with Market Intel rank refresh cadence.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists market_rank_wins_cache (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  app_id         uuid not null references public.apps (id) on delete cascade,
  progress_json  jsonb not null,
  forecast_json  jsonb not null,
  fetched_at     timestamptz not null default now(),
  expires_at     timestamptz not null default (now() + interval '6 hours')
);

create unique index if not exists market_rank_wins_cache_key_idx
  on market_rank_wins_cache (workspace_id, app_id);

create index if not exists market_rank_wins_cache_expires_idx
  on market_rank_wins_cache (expires_at);

alter table market_rank_wins_cache enable row level security;

create policy "service_full_access" on market_rank_wins_cache
  for all
  to service_role
  using (true)
  with check (true);

create policy "anon_read" on market_rank_wins_cache
  for select
  to anon
  using (true);

create policy "auth_read" on market_rank_wins_cache
  for select
  to authenticated
  using (true);
