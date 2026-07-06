-- ══════════════════════════════════════════════════════════════════════════════
-- ops_config — lightweight key/value store for operational parameters.
--
-- Purpose: pg_cron jobs and SQL-level maintenance queries run entirely inside
-- Postgres and cannot read process.env or .env files.  This table provides a
-- single source of truth for tunable operational parameters (e.g. zombie job
-- timeout) that is readable from both application code and pg_cron SQL jobs.
--
-- When ZOMBIE_JOB_TIMEOUT_MINUTES is changed in .env / Vercel env vars, the
-- corresponding row in this table must also be updated so that pg_cron uses
-- the same value.  See MAINTENANCE.md → "How to Apply a Timeout Change".
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.ops_config (
  key         text        primary key,
  value       text        not null,
  description text,
  updated_at  timestamptz not null default now()
);

comment on table public.ops_config is
  'Operational configuration values readable by pg_cron and application code alike. '
  'Manage via SQL migrations or direct UPDATE; never store secrets here.';

-- Row-level security: readable by service role only (not exposed to users).
alter table public.ops_config enable row level security;

-- No policies → only service-role / postgres user can access rows.
-- Application code reads this table via the Supabase admin (service role) client.

-- ── Seed: zombie job timeout ─────────────────────────────────────────────────
-- Default matches ZOMBIE_JOB_TIMEOUT_MINUTES fallback in detect-zombie-jobs.mjs.
-- Update this value whenever you change ZOMBIE_JOB_TIMEOUT_MINUTES in .env.
insert into public.ops_config (key, value, description)
values (
  'zombie_job_timeout_minutes',
  '30',
  'Jobs in pending/processing status older than this many minutes are considered zombie jobs. '
  'Must be kept in sync with the ZOMBIE_JOB_TIMEOUT_MINUTES environment variable.'
)
on conflict (key) do nothing;

-- ── Helper function ──────────────────────────────────────────────────────────
-- Returns the zombie timeout as an integer, falling back to 30 if the row is
-- missing or non-numeric.  Use in pg_cron SQL and ad-hoc queries.
--
-- Example:
--   SELECT public.zombie_job_timeout_minutes();  -- returns 30 (or configured value)
--
create or replace function public.zombie_job_timeout_minutes()
returns integer
language sql
stable
security definer
as $$
  select coalesce(
    (
      select nullif(trim(value), '')::integer
      from   public.ops_config
      where  key = 'zombie_job_timeout_minutes'
    ),
    30
  );
$$;

comment on function public.zombie_job_timeout_minutes() is
  'Returns the configured zombie-job stale threshold in minutes from ops_config, '
  'defaulting to 30 if the key is missing or non-numeric.';

-- ── Trigger: keep updated_at current ────────────────────────────────────────
create or replace function public.ops_config_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ops_config_updated_at on public.ops_config;
create trigger trg_ops_config_updated_at
  before update on public.ops_config
  for each row
  execute function public.ops_config_set_updated_at();
