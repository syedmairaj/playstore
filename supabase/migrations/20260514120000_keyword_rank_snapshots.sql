-- Keyword Tracker: canonical rank history table + keywords enhancements.
-- Replaces public.keyword_ranks with keyword_rank_snapshots (richer model for trends, alerts, competitors).

-- ---------------------------------------------------------------------------
-- keywords: timestamps, rolling best rank, workspace-only tracking, optional app
-- ---------------------------------------------------------------------------
alter table public.keywords
  add column if not exists updated_at timestamptz not null default now();

alter table public.keywords
  add column if not exists best_rank integer;

comment on column public.keywords.best_rank is
  'Best (lowest) Play Store rank observed for this keyword across all snapshots; maintained by trigger on keyword_rank_snapshots.';

comment on column public.keywords.updated_at is
  'Last update to the keyword row (term/market/locale) or refreshed when rank snapshots update rolling stats.';

comment on column public.keywords.term is
  'Tracked keyword text for Google Play ASO (product UI may label this “keyword”).';

-- Optional workspace-level keyword rows (no specific app): enforce uniqueness with partial indexes.
drop index if exists keywords_unique_term_per_app;

create unique index if not exists keywords_unique_term_with_app
  on public.keywords (workspace_id, app_id, lower(trim(term)), market)
  where app_id is not null;

create unique index if not exists keywords_unique_term_workspace_only
  on public.keywords (workspace_id, lower(trim(term)), market)
  where app_id is null;

alter table public.keywords
  alter column app_id drop not null;

-- Denormalized display alias (trimmed term); constraints still use term + market.
alter table public.keywords
  add column if not exists keyword text generated always as (trim(term)) stored;

comment on column public.keywords.keyword is
  'Generated trimmed copy of term for reporting/views; unique per workspace/app/market uses raw term.';

create or replace function public.keywords_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists keywords_set_updated_at on public.keywords;
create trigger keywords_set_updated_at
  before update on public.keywords
  for each row
  execute procedure public.keywords_touch_updated_at();

-- ---------------------------------------------------------------------------
-- keyword_rank_snapshots (replaces keyword_ranks)
-- ---------------------------------------------------------------------------
create table if not exists public.keyword_rank_snapshots (
  id uuid primary key default gen_random_uuid(),
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  rank integer not null,
  best_rank integer not null,
  search_volume integer,
  snapshot_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  source text not null default 'manual'
);

comment on table public.keyword_rank_snapshots is
  'Time-series rank measurements for tracked keywords; powers history charts, alerts, and competitor deltas.';

comment on column public.keyword_rank_snapshots.rank is
  'Observed Play Store search rank for this snapshot (lower integer = better visibility).';

comment on column public.keyword_rank_snapshots.best_rank is
  'Best rank achieved for this keyword up to and including this snapshot (running minimum of rank).';

comment on column public.keyword_rank_snapshots.search_volume is
  'Optional estimated monthly search volume when available from providers; null until wired.';

comment on column public.keyword_rank_snapshots.snapshot_at is
  'When the rank measurement applies (UTC); typically daily bucket boundary for charts.';

comment on column public.keyword_rank_snapshots.source is
  'Origin of the measurement: manual, demo, api_job, competitor_scrape, etc.';

create index if not exists keyword_rank_snapshots_kw_time_idx
  on public.keyword_rank_snapshots (keyword_id, snapshot_at desc);

create index if not exists keyword_rank_snapshots_kw_created_idx
  on public.keyword_rank_snapshots (keyword_id, created_at desc);

-- Fast workspace-scoped analytics via join to keywords (workspace_id lives on keywords).
create index if not exists keywords_workspace_app_idx
  on public.keywords (workspace_id, app_id);

-- ---------------------------------------------------------------------------
-- Migrate legacy keyword_ranks → keyword_rank_snapshots
-- ---------------------------------------------------------------------------
insert into public.keyword_rank_snapshots (
  keyword_id,
  rank,
  best_rank,
  search_volume,
  snapshot_at,
  created_at,
  source
)
select
  kr.keyword_id,
  kr.rank,
  coalesce(
    min(kr.rank) filter (where kr.rank is not null) over (
      partition by kr.keyword_id
      order by kr.captured_at asc
      rows between unbounded preceding and current row
    ),
    kr.rank
  ) as best_rank,
  null::integer as search_volume,
  kr.captured_at as snapshot_at,
  kr.captured_at as created_at,
  kr.source
from public.keyword_ranks kr
where kr.rank is not null;

-- Snapshots with null rank (edge case): skip — nothing to chart.

-- Drop legacy table (policies drop with table)
drop table if exists public.keyword_ranks cascade;

-- Refresh keywords.best_rank from migrated snapshots
update public.keywords k
set best_rank = sub.m,
    updated_at = now()
from (
  select keyword_id, min(rank) as m
  from public.keyword_rank_snapshots
  group by keyword_id
) sub
where k.id = sub.keyword_id;

-- ---------------------------------------------------------------------------
-- Triggers: maintain snapshot.best_rank and keywords.best_rank
-- ---------------------------------------------------------------------------
create or replace function public.keyword_rank_snapshots_set_best_rank()
returns trigger
language plpgsql
as $$
declare
  v_min integer;
begin
  select min(r) into v_min
  from (
    select rank as r
    from public.keyword_rank_snapshots
    where keyword_id = new.keyword_id
      and rank is not null
    union all
    select new.rank as r
  ) q;

  new.best_rank := coalesce(v_min, new.rank);
  return new;
end;
$$;

comment on function public.keyword_rank_snapshots_set_best_rank() is
  'BEFORE INSERT: sets best_rank to the minimum rank seen for this keyword including the new row.';

drop trigger if exists keyword_rank_snapshots_set_best_rank_trg on public.keyword_rank_snapshots;
create trigger keyword_rank_snapshots_set_best_rank_trg
  before insert on public.keyword_rank_snapshots
  for each row
  execute procedure public.keyword_rank_snapshots_set_best_rank();

create or replace function public.keyword_rank_snapshots_refresh_keyword_best()
returns trigger
language plpgsql
as $$
begin
  update public.keywords
  set
    best_rank = (
      select min(rank)
      from public.keyword_rank_snapshots
      where keyword_id = new.keyword_id
        and rank is not null
    ),
    updated_at = now()
  where id = new.keyword_id;
  return new;
end;
$$;

drop trigger if exists keyword_rank_snapshots_refresh_kw_trg on public.keyword_rank_snapshots;
create trigger keyword_rank_snapshots_refresh_kw_trg
  after insert on public.keyword_rank_snapshots
  for each row
  execute procedure public.keyword_rank_snapshots_refresh_keyword_best();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.keyword_rank_snapshots enable row level security;

create policy "keyword_rank_snapshots_select_member"
  on public.keyword_rank_snapshots for select
  using (
    exists (
      select 1
      from public.keywords k
      where k.id = keyword_rank_snapshots.keyword_id
        and public.is_workspace_member(k.workspace_id)
    )
  );

create policy "keyword_rank_snapshots_insert_member"
  on public.keyword_rank_snapshots for insert
  with check (
    exists (
      select 1
      from public.keywords k
      where k.id = keyword_rank_snapshots.keyword_id
        and public.is_workspace_member(k.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- View: convenient analytics / BI / alerts
-- ---------------------------------------------------------------------------
create or replace view public.keyword_rank_history as
select
  s.id as snapshot_id,
  s.keyword_id,
  k.workspace_id,
  k.app_id,
  k.term as keyword,
  s.rank,
  s.best_rank,
  s.search_volume,
  (s.snapshot_at at time zone 'UTC')::date as snapshot_date,
  s.snapshot_at,
  s.created_at,
  s.source
from public.keyword_rank_snapshots s
join public.keywords k on k.id = s.keyword_id;

comment on view public.keyword_rank_history is
  'Flattened rank history with workspace scope for trends, exports, and future competitor joins.';

grant select on public.keyword_rank_history to authenticated;
grant select on public.keyword_rank_history to service_role;
