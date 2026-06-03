-- Persisted AI listing localizations per workspace app + Play market.

create table if not exists public.workspace_localized_listings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  market text not null,
  title text not null,
  short_description text not null,
  long_description text not null default '',
  keywords jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint workspace_localized_listings_market_len check (char_length(market) between 2 and 8),
  constraint workspace_localized_listings_title_len check (char_length(title) between 1 and 30),
  constraint workspace_localized_listings_short_len check (char_length(short_description) between 1 and 80),
  constraint workspace_localized_listings_long_len check (char_length(long_description) <= 4000),
  constraint workspace_localized_listings_market_code check (market in ('ae', 'in', 'mx')),
  unique (workspace_id, app_id, market)
);

create index if not exists workspace_localized_listings_workspace_app_idx
  on public.workspace_localized_listings (workspace_id, app_id, updated_at desc);

comment on table public.workspace_localized_listings is
  'Gemini-localized Play listing copy per workspace app and market. RLS: workspace members.';

alter table public.workspace_localized_listings enable row level security;

create policy "workspace_localized_listings_select_member"
  on public.workspace_localized_listings for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_localized_listings_insert_member"
  on public.workspace_localized_listings for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_localized_listings_update_member"
  on public.workspace_localized_listings for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_localized_listings_delete_member"
  on public.workspace_localized_listings for delete
  using (public.is_workspace_member(workspace_id));
