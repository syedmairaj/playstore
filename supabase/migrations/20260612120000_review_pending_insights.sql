-- Review Curation: pending insights await user Adopt before entering Active Context.

create table if not exists public.review_pending_insights (
  id                        uuid primary key default gen_random_uuid(),
  workspace_id              uuid not null references public.workspaces (id) on delete cascade,
  competitor_insights_id    uuid references public.competitor_insights (id) on delete cascade,
  analysis_transaction_id   uuid references public.credits_ledger (id) on delete set null,
  package_name              text not null,
  lang_code                 text not null default 'en',
  country                   text not null default 'us',
  title                     text not null,
  description               text not null,
  severity                  text not null
    check (severity in ('CRITICAL', 'MEDIUM', 'LOW')),
  impact                    numeric not null
    check (impact >= 0 and impact <= 1),
  quote                     text not null default '',
  category                  text not null
    check (category in ('UX', 'CRASHES', 'ACCURACY', 'PERFORMANCE', 'PRICING', 'FEATURES')),
  status                    text not null default 'pending'
    check (status in ('pending', 'adopted', 'dismissed')),
  queue_item_id             text,
  adopted_at                timestamptz,
  adopted_by                uuid references auth.users (id) on delete set null,
  cluster_index             int not null default 0,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists review_pending_insights_workspace_cluster_status_idx
  on public.review_pending_insights (workspace_id, package_name, lang_code, country, status);

create index if not exists review_pending_insights_transaction_idx
  on public.review_pending_insights (workspace_id, analysis_transaction_id)
  where analysis_transaction_id is not null;

comment on table public.review_pending_insights is
  'Curation queue: review pain-point clusters after paid Sync Insights; Adopt promotes to Active Context.';

alter table public.review_pending_insights enable row level security;

create policy "workspace_members_select_pending_insights"
  on public.review_pending_insights
  for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_members_write_pending_insights"
  on public.review_pending_insights
  for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_update_pending_insights"
  on public.review_pending_insights
  for update
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_members_delete_pending_insights"
  on public.review_pending_insights
  for delete
  using (public.is_workspace_member(workspace_id));
