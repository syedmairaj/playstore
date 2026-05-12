-- Phase 1 MVP: listing generations, usage logging, rate limiting (per docs/database.md extensions)
-- Run in Supabase SQL Editor or via supabase db push.

create table if not exists public.rate_limit_buckets (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start);

create table if not exists public.usage_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  route text not null,
  client_ip text,
  success boolean not null,
  duration_ms int,
  error_message text,
  meta jsonb
);

create index if not exists usage_logs_created_at_idx
  on public.usage_logs (created_at desc);

create table if not exists public.listing_generations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  app_name text not null,
  category text not null,
  target_keywords text[] not null,
  app_features text not null,
  tone_style text not null,
  client_ip text,
  model text not null,
  output_json jsonb not null,
  prompt_version text not null default 'listing-optimizer-v1'
);

create index if not exists listing_generations_created_at_idx
  on public.listing_generations (created_at desc);

-- Atomic per-minute counter for an arbitrary key (e.g. IP-scoped id)
create or replace function public.consume_rate_limit(p_key text, p_max int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ws timestamptz := date_trunc('minute', clock_timestamp());
  new_count int;
begin
  insert into public.rate_limit_buckets (key, window_start, count)
  values (p_key, ws, 1)
  on conflict (key, window_start)
  do update set count = public.rate_limit_buckets.count + 1
  returning count into new_count;

  return jsonb_build_object(
    'allowed', new_count <= p_max,
    'count', new_count
  );
end;
$$;

revoke all on function public.consume_rate_limit(text, int) from public;
grant execute on function public.consume_rate_limit(text, int) to service_role;

alter table public.rate_limit_buckets enable row level security;
alter table public.usage_logs enable row level security;
alter table public.listing_generations enable row level security;

-- Optional: prune old buckets (call from cron). Example:
-- delete from public.rate_limit_buckets where window_start < now() - interval '2 hours';
