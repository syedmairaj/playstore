-- Session-scoped listing_generations: one canonical row per (workspace, user, app)
-- with automatic updated_at audit trail and upsert-friendly unique indexes.

alter table public.listing_generations
  add column if not exists updated_at timestamptz not null default now();

comment on column public.listing_generations.updated_at is
  'Last write timestamp — refreshed on every insert/update via trg_listing_generations_updated_at.';

update public.listing_generations
set updated_at = created_at;

-- Deduplicate before unique session indexes (keep newest row per session).
with ranked as (
  select
    id,
    row_number() over (
      partition by workspace_id, user_id, app_id
      order by created_at desc nulls last, id desc
    ) as rn
  from public.listing_generations
  where workspace_id is not null
    and user_id is not null
)
delete from public.listing_generations lg
using ranked r
where lg.id = r.id
  and r.rn > 1;

create unique index if not exists listing_generations_workspace_app_user_session_uidx
  on public.listing_generations (workspace_id, app_id, user_id)
  where app_id is not null;

create unique index if not exists listing_generations_workspace_user_no_app_session_uidx
  on public.listing_generations (workspace_id, user_id)
  where app_id is null;

create index if not exists listing_generations_workspace_app_updated_idx
  on public.listing_generations (workspace_id, app_id, updated_at desc);

drop trigger if exists trg_listing_generations_updated_at on public.listing_generations;

create trigger trg_listing_generations_updated_at
  before update on public.listing_generations
  for each row
  execute function public.set_updated_at();
