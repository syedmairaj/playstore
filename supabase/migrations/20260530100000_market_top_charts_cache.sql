-- ─────────────────────────────────────────────────────────────────────────────
-- market_top_charts_cache
--
-- Caches Google Play top-chart results per (category, country, collection).
-- TTL is 6 hours — fresh enough for daily ASO decisions without hammering
-- the Play Store scraper on every page load.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists market_top_charts_cache (
  id            uuid primary key default gen_random_uuid(),
  -- gplay category ID, e.g. "HEALTH_AND_FITNESS"
  category      text not null,
  -- ISO 3166-1 alpha-2 country code, e.g. "us"
  country       text not null,
  -- collection ID: "TOP_FREE" | "TOP_PAID" | "GROSSING"
  collection    text not null default 'TOP_FREE',
  -- JSON array of TopChartApp objects (rank-ordered, index 0 = #1)
  apps_json     jsonb not null,
  -- When this cache entry was fetched
  fetched_at    timestamptz not null default now(),
  -- Cache expires after 6 hours
  expires_at    timestamptz not null default (now() + interval '6 hours'),

  constraint market_top_charts_cache_collection_check
    check (collection in ('TOP_FREE', 'TOP_PAID', 'GROSSING'))
);

-- Unique index so upsert works cleanly
create unique index if not exists market_top_charts_cache_key_idx
  on market_top_charts_cache (category, country, collection);

-- Index for fast expiry sweeps
create index if not exists market_top_charts_cache_expires_idx
  on market_top_charts_cache (expires_at);

-- RLS: this is server-side cached data, not user-owned — no RLS needed.
-- The API route handles auth before querying this table.
alter table market_top_charts_cache enable row level security;

-- Service role can do everything (API routes use service role or anon depending on setup)
create policy "service_full_access" on market_top_charts_cache
  for all
  to service_role
  using (true)
  with check (true);

-- Anon can read (cache reads in server components use anon key)
create policy "anon_read" on market_top_charts_cache
  for select
  to anon
  using (true);

-- Authenticated users can read
create policy "auth_read" on market_top_charts_cache
  for select
  to authenticated
  using (true);
