-- Align admin_ai_transaction_logs when an older table was created before
-- workspace_id / credits_charged (CREATE TABLE IF NOT EXISTS skips new columns).

-- Ensure base table exists (no-op when 20260519140000 already applied fully).
create table if not exists public.admin_ai_transaction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  feature_slug text not null,
  prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  raw_usd_cost numeric(12, 6) not null check (raw_usd_cost >= 0),
  credits_charged integer not null default 0 check (credits_charged >= 0),
  created_at timestamptz not null default now()
);

alter table public.admin_ai_transaction_logs
  add column if not exists workspace_id uuid references public.workspaces (id) on delete set null;

alter table public.admin_ai_transaction_logs
  add column if not exists feature_slug text;

alter table public.admin_ai_transaction_logs
  add column if not exists prompt_tokens integer not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists completion_tokens integer not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists total_tokens integer;

alter table public.admin_ai_transaction_logs
  add column if not exists raw_usd_cost numeric(12, 6) not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists credits_charged integer not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists created_at timestamptz not null default now();

-- Legacy drafts used candidate_tokens; app expects completion_tokens.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_ai_transaction_logs'
      and column_name = 'candidate_tokens'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_ai_transaction_logs'
      and column_name = 'completion_tokens'
  ) then
    alter table public.admin_ai_transaction_logs
      rename column candidate_tokens to completion_tokens;
  end if;
end $$;

create index if not exists admin_ai_transaction_logs_feature_slug_idx
  on public.admin_ai_transaction_logs (feature_slug);

create index if not exists admin_ai_transaction_logs_created_at_idx
  on public.admin_ai_transaction_logs (created_at desc);

create index if not exists admin_ai_transaction_logs_workspace_id_idx
  on public.admin_ai_transaction_logs (workspace_id)
  where workspace_id is not null;

alter table public.admin_ai_transaction_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_ai_transaction_logs'
      and policyname = 'admin_ai_transaction_logs_select_admin'
  ) then
    create policy "admin_ai_transaction_logs_select_admin"
      on public.admin_ai_transaction_logs for select
      to authenticated
      using (
        exists (
          select 1
          from public.profiles p
          where p.id = auth.uid()
            and (p.is_admin = true or p.role = 'admin')
        )
      );
  end if;
end $$;
