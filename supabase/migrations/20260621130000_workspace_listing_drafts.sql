-- Modular listing optimizer drafts keyed by active-context queue_hash (EN/AR vault branches).
-- Idempotent: safe when workspace_listing_drafts already exists (e.g. pre-queue_hash schema).

create table if not exists public.workspace_listing_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.workspace_listing_drafts
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

alter table public.workspace_listing_drafts
  add column if not exists app_id uuid references public.apps (id) on delete set null;

alter table public.workspace_listing_drafts
  add column if not exists vault_locale text;

alter table public.workspace_listing_drafts
  add column if not exists queue_hash text;

alter table public.workspace_listing_drafts
  add column if not exists title text;

alter table public.workspace_listing_drafts
  add column if not exists short_description jsonb;

alter table public.workspace_listing_drafts
  add column if not exists long_description jsonb;

alter table public.workspace_listing_drafts
  add column if not exists modular_listing jsonb;

-- Backfill required columns on legacy rows before NOT NULL / CHECK constraints.
update public.workspace_listing_drafts
set vault_locale = 'en'
where vault_locale is null;

update public.workspace_listing_drafts d
set user_id = sub.owner_id
from (
  select distinct on (wm.workspace_id)
    wm.workspace_id,
    wm.user_id as owner_id
  from public.workspace_members wm
  where wm.role = 'owner'
  order by wm.workspace_id, wm.user_id
) sub
where d.workspace_id = sub.workspace_id
  and d.user_id is null;

-- Legacy rows without a vault hash cannot be rehydrated — remove before constraints.
delete from public.workspace_listing_drafts
where queue_hash is null
   or queue_hash !~ '^[a-f0-9]{64}$';

delete from public.workspace_listing_drafts
where user_id is null;

alter table public.workspace_listing_drafts
  alter column vault_locale set default 'en';

alter table public.workspace_listing_drafts
  alter column vault_locale set not null;

alter table public.workspace_listing_drafts
  alter column user_id set not null;

alter table public.workspace_listing_drafts
  alter column queue_hash set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_listing_drafts_vault_locale_chk'
      and conrelid = 'public.workspace_listing_drafts'::regclass
  ) then
    alter table public.workspace_listing_drafts
      add constraint workspace_listing_drafts_vault_locale_chk
      check (vault_locale in ('en', 'ar'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_listing_drafts_queue_hash_chk'
      and conrelid = 'public.workspace_listing_drafts'::regclass
  ) then
    alter table public.workspace_listing_drafts
      add constraint workspace_listing_drafts_queue_hash_chk
      check (queue_hash ~ '^[a-f0-9]{64}$');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_listing_drafts_workspace_queue_hash_uidx'
      and conrelid = 'public.workspace_listing_drafts'::regclass
  ) then
    alter table public.workspace_listing_drafts
      add constraint workspace_listing_drafts_workspace_queue_hash_uidx
      unique (workspace_id, queue_hash);
  end if;
end $$;

create index if not exists workspace_listing_drafts_workspace_updated_idx
  on public.workspace_listing_drafts (workspace_id, updated_at desc);

create index if not exists workspace_listing_drafts_user_idx
  on public.workspace_listing_drafts (user_id);

comment on table public.workspace_listing_drafts is
  'Per-workspace modular listing draft snapshots keyed by optimization queue hash. Upserted on each generate step.';

alter table public.workspace_listing_drafts enable row level security;

drop policy if exists "workspace_listing_drafts_select_member" on public.workspace_listing_drafts;
create policy "workspace_listing_drafts_select_member"
  on public.workspace_listing_drafts for select
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_listing_drafts_insert_member" on public.workspace_listing_drafts;
create policy "workspace_listing_drafts_insert_member"
  on public.workspace_listing_drafts for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop policy if exists "workspace_listing_drafts_update_member" on public.workspace_listing_drafts;
create policy "workspace_listing_drafts_update_member"
  on public.workspace_listing_drafts for update
  to authenticated
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

drop trigger if exists trg_workspace_listing_drafts_updated_at on public.workspace_listing_drafts;

create trigger trg_workspace_listing_drafts_updated_at
  before update on public.workspace_listing_drafts
  for each row
  execute function public.set_updated_at();
