-- Reviews → AI Listing Optimizer queue (per workspace; replaces client-only localStorage).

create table if not exists public.workspace_listing_improvements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  app_id uuid references public.apps (id) on delete set null,
  package_name text,
  review_id text not null,
  review_text text not null,
  user_name text not null,
  score smallint not null,
  sentiment_tag text not null default 'Competitor Weakness',
  is_utilized boolean not null default false,
  created_at timestamptz not null default now(),
  constraint workspace_listing_improvements_review_id_len check (char_length(review_id) between 1 and 512),
  constraint workspace_listing_improvements_review_text_len check (char_length(review_text) between 1 and 8000),
  constraint workspace_listing_improvements_user_name_len check (char_length(user_name) between 1 and 256),
  constraint workspace_listing_improvements_score_range check (score between 1 and 5),
  constraint workspace_listing_improvements_sentiment_len check (char_length(sentiment_tag) between 1 and 120),
  constraint workspace_listing_improvements_app_ref check (
    app_id is not null
    or (package_name is not null and char_length(trim(package_name)) >= 3)
  ),
  constraint workspace_listing_improvements_package_len check (
    package_name is null or char_length(package_name) between 3 and 255
  ),
  unique (workspace_id, review_id)
);

create index if not exists workspace_listing_improvements_workspace_unutilized_idx
  on public.workspace_listing_improvements (workspace_id, created_at desc)
  where (is_utilized = false);

comment on table public.workspace_listing_improvements is
  'Review snippets queued for AI Listing Optimizer (from Reviews dashboard). RLS: workspace members.';

alter table public.workspace_listing_improvements enable row level security;

create policy "workspace_listing_improvements_select_member"
  on public.workspace_listing_improvements for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_listing_improvements_insert_member"
  on public.workspace_listing_improvements for insert
  with check (
    public.is_workspace_member(workspace_id)
    and user_id = auth.uid()
  );

create policy "workspace_listing_improvements_update_member"
  on public.workspace_listing_improvements for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_listing_improvements_delete_member"
  on public.workspace_listing_improvements for delete
  using (public.is_workspace_member(workspace_id));
