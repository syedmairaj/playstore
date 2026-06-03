-- Tag rank snapshots with the keyword's primary Play market when known.
-- Legacy rows keep country_code NULL (single folded series in history UIs).
-- New Serper saves/refresh set country_code to the keyword `market` (lowercase alpha-2).

alter table public.keyword_rank_snapshots
  add column if not exists country_code text;

comment on column public.keyword_rank_snapshots.country_code is
  'Lowercase ISO 3166-1 alpha-2 Play market for this snapshot (matches keywords.market for Serper rows). NULL for legacy folded snapshots or manual entries without a market tag.';

create index if not exists keyword_rank_snapshots_kw_country_time_idx
  on public.keyword_rank_snapshots (keyword_id, country_code, snapshot_at desc);
