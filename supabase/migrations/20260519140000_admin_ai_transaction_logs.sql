-- Token-level AI COGS logging for admin analytics (service-role inserts; admin read via RLS).

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

create index if not exists admin_ai_transaction_logs_feature_slug_idx
  on public.admin_ai_transaction_logs (feature_slug);

create index if not exists admin_ai_transaction_logs_created_at_idx
  on public.admin_ai_transaction_logs (created_at desc);

create index if not exists admin_ai_transaction_logs_workspace_id_idx
  on public.admin_ai_transaction_logs (workspace_id)
  where workspace_id is not null;

comment on table public.admin_ai_transaction_logs is
  'Per AI call token + USD COGS for admin margin analytics. Inserts via service role from API routes.';

alter table public.admin_ai_transaction_logs enable row level security;

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
