-- Phase 1 Context Gateway — normalized ASO signal tables (EN/AR).

create table if not exists public.workspace_keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  keyword text not null,
  is_staged boolean not null default false,
  queue_hash text,
  confidence smallint not null default 72 check (confidence between 0 and 100),
  difficulty smallint check (difficulty between 0 and 10),
  search_volume integer check (search_volume >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_keywords_keyword_len check (char_length(trim(keyword)) between 1 and 80),
  constraint workspace_keywords_queue_hash_len check (
    queue_hash is null or char_length(queue_hash) = 64
  )
);

create unique index if not exists workspace_keywords_unique_staged
  on public.workspace_keywords (workspace_id, coalesce(app_id, '00000000-0000-0000-0000-000000000000'::uuid), locale, lower(trim(keyword)));

create index if not exists workspace_keywords_workspace_staged_idx
  on public.workspace_keywords (workspace_id, locale, is_staged)
  where is_staged = true;

create table if not exists public.workspace_market_snapshots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  keyword text not null,
  rank integer,
  search_volume integer,
  country_code text,
  snapshot_at timestamptz not null default now(),
  queue_hash text,
  payload jsonb not null default '{}'::jsonb,
  constraint workspace_market_snapshots_keyword_len check (char_length(trim(keyword)) between 1 and 80)
);

create index if not exists workspace_market_snapshots_workspace_locale_idx
  on public.workspace_market_snapshots (workspace_id, locale, snapshot_at desc);

create table if not exists public.workspace_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  review_id text not null,
  review_text text not null,
  score smallint not null check (score between 1 and 5),
  sentiment_tag text not null,
  ai_tags text[] not null default '{}',
  is_utilized boolean not null default false,
  queue_hash text,
  created_at timestamptz not null default now(),
  constraint workspace_reviews_review_id_len check (char_length(review_id) between 1 and 512),
  constraint workspace_reviews_review_text_len check (char_length(review_text) between 1 and 8000),
  constraint workspace_reviews_sentiment_len check (char_length(sentiment_tag) between 1 and 120),
  unique (workspace_id, review_id)
);

create index if not exists workspace_reviews_workspace_ai_tags_idx
  on public.workspace_reviews (workspace_id, created_at desc)
  where cardinality(ai_tags) > 0 or char_length(trim(sentiment_tag)) > 0;

comment on table public.workspace_keywords is
  'Context Gateway — staged Keyword Tracker terms for listing synthesis (EN/AR).';
comment on table public.workspace_market_snapshots is
  'Context Gateway — market rank / volume snapshots for listing synthesis.';
comment on table public.workspace_reviews is
  'Context Gateway — review snippets tagged for AI listing synthesis.';

alter table public.workspace_keywords enable row level security;
alter table public.workspace_market_snapshots enable row level security;
alter table public.workspace_reviews enable row level security;

create policy "workspace_keywords_select_member"
  on public.workspace_keywords for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_market_snapshots_select_member"
  on public.workspace_market_snapshots for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_reviews_select_member"
  on public.workspace_reviews for select
  using (public.is_workspace_member(workspace_id));

-- Backfill staged keywords from existing Keyword Tracker rows (Phase 1 bridge).
insert into public.workspace_keywords (
  workspace_id,
  app_id,
  locale,
  keyword,
  is_staged,
  confidence
)
select
  k.workspace_id,
  k.app_id,
  case when lower(coalesce(k.locale, 'en')) = 'ar' then 'ar' else 'en' end,
  trim(coalesce(nullif(trim(k.keyword), ''), k.term)),
  true,
  72
from public.keywords k
where char_length(trim(coalesce(nullif(trim(k.keyword), ''), k.term))) > 0
  and not exists (
    select 1
    from public.workspace_keywords wk
    where wk.workspace_id = k.workspace_id
      and wk.locale = case when lower(coalesce(k.locale, 'en')) = 'ar' then 'ar' else 'en' end
      and lower(trim(wk.keyword)) = lower(trim(coalesce(nullif(trim(k.keyword), ''), k.term)))
      and coalesce(wk.app_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = coalesce(k.app_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

-- Backfill review signals from listing improvements queue.
insert into public.workspace_reviews (
  workspace_id,
  app_id,
  review_id,
  review_text,
  score,
  sentiment_tag,
  ai_tags,
  is_utilized,
  created_at
)
select
  w.workspace_id,
  w.app_id,
  w.review_id,
  w.review_text,
  w.score,
  w.sentiment_tag,
  array[w.sentiment_tag]::text[],
  w.is_utilized,
  w.created_at
from public.workspace_listing_improvements w
where char_length(trim(w.sentiment_tag)) > 0
  and not exists (
    select 1 from public.workspace_reviews wr
    where wr.workspace_id = w.workspace_id and wr.review_id = w.review_id
  );

-- Backfill latest market snapshot per keyword (best-effort).
insert into public.workspace_market_snapshots (
  workspace_id,
  app_id,
  locale,
  keyword,
  rank,
  search_volume,
  country_code,
  snapshot_at
)
select distinct on (k.workspace_id, coalesce(k.app_id, '00000000-0000-0000-0000-000000000000'::uuid), k.id)
  k.workspace_id,
  k.app_id,
  case when lower(coalesce(k.locale, 'en')) = 'ar' then 'ar' else 'en' end,
  trim(coalesce(nullif(trim(k.keyword), ''), k.term)),
  s.rank,
  s.search_volume,
  s.country_code,
  s.snapshot_at
from public.keywords k
inner join lateral (
  select rank, search_volume, country_code, snapshot_at
  from public.keyword_rank_snapshots
  where keyword_id = k.id
  order by snapshot_at desc
  limit 1
) s on true
where char_length(trim(coalesce(nullif(trim(k.keyword), ''), k.term))) > 0
order by k.workspace_id, coalesce(k.app_id, '00000000-0000-0000-0000-000000000000'::uuid), k.id, s.snapshot_at desc;
