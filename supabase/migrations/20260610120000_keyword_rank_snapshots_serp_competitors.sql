alter table public.keyword_rank_snapshots
  add column if not exists serp_competitors jsonb;

comment on column public.keyword_rank_snapshots.serp_competitors is
  'Top SERP apps from last fetch: [{rank, title, package_name, icon_url?}]';
