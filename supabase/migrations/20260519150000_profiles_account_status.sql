-- Account moderation: active (default), flagged for review, or suspended (blocks API + app).

alter table public.profiles
  add column if not exists account_status text not null default 'active';

alter table public.profiles
  drop constraint if exists profiles_account_status_check;

alter table public.profiles
  add constraint profiles_account_status_check
  check (account_status in ('active', 'flagged', 'suspended'));

comment on column public.profiles.account_status is
  'Site-wide access: active (normal), flagged (admin review), suspended (API + app blocked).';

create index if not exists profiles_account_status_idx
  on public.profiles (account_status)
  where account_status <> 'active';
