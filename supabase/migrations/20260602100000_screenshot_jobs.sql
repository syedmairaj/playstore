-- ---------------------------------------------------------------------------
-- Screenshot Jobs
-- Tracks async screenshot generation jobs so the client can poll for progress.
-- The generate route writes a job row immediately (202 response), then the
-- background task updates it as each slide completes.
-- ---------------------------------------------------------------------------

create table if not exists public.screenshot_jobs (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Ownership
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  app_id         uuid references public.apps (id) on delete set null,
  user_id        uuid references auth.users (id) on delete set null,

  -- Job lifecycle
  -- pending   → background task has not started yet
  -- running   → background task is executing
  -- completed → all slides generated and saved
  -- failed    → unrecoverable error; credits refunded
  status         text not null default 'pending',

  -- Progress: number of slides fully saved to vault (0–6)
  progress       smallint not null default 0,
  total          smallint not null default 6,

  -- Slides as they complete (appended one-by-one by the background task)
  -- Each element: { backgroundUrl, layoutMap, slide, optimizedForConversion }
  slides         jsonb not null default '[]'::jsonb,

  -- Batch identifier shared with brand_assets rows for this job
  batch_id       uuid,

  -- Flags
  optimized_for_conversion boolean not null default false,

  -- Error message if status = 'failed'
  error_message  text,

  -- Ledger entry to refund on failure
  ledger_id      uuid,

  -- Credits charged
  credits_charged smallint,
  credits_remaining integer,

  constraint screenshot_jobs_status_chk check (
    status in ('pending', 'running', 'completed', 'failed')
  )
);

create index if not exists screenshot_jobs_workspace_idx
  on public.screenshot_jobs (workspace_id, created_at desc);

create index if not exists screenshot_jobs_status_idx
  on public.screenshot_jobs (status, created_at desc);

-- Auto-update updated_at
create or replace function public.screenshot_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists screenshot_jobs_updated_at_trg on public.screenshot_jobs;
create trigger screenshot_jobs_updated_at_trg
  before update on public.screenshot_jobs
  for each row execute function public.screenshot_jobs_updated_at();

comment on table public.screenshot_jobs is
  'Async screenshot generation jobs. Client polls GET /api/screenshot-studio/job/[id] for progress.';

-- ---------------------------------------------------------------------------
-- RLS: workspace members can read their own jobs.
-- All writes are done server-side via service role.
-- ---------------------------------------------------------------------------
alter table public.screenshot_jobs enable row level security;

create policy "screenshot_jobs_select_member"
  on public.screenshot_jobs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Fix brand_assets type constraint to include 'screenshot'
-- (Previous migration only allowed 'icon' | 'banner')
-- ---------------------------------------------------------------------------
alter table public.brand_assets
  drop constraint if exists brand_assets_type_chk;

alter table public.brand_assets
  add constraint brand_assets_type_chk
  check (asset_type in ('icon', 'banner', 'screenshot'));

-- Also raise the storage file size limit from 5 MB to 15 MB for screenshots
update storage.buckets
  set file_size_limit = 15728640
  where id = 'brand-assets';
