-- Async listing generation job tracking on modular drafts (QStash worker progress).

alter table public.workspace_listing_drafts
  add column if not exists job_id uuid;

alter table public.workspace_listing_drafts
  add column if not exists generation_status text;

alter table public.workspace_listing_drafts
  add column if not exists generation_error text;

alter table public.workspace_listing_drafts
  add column if not exists current_phase text;

alter table public.workspace_listing_drafts
  add column if not exists generation_payload jsonb;

alter table public.workspace_listing_drafts
  add column if not exists generation_result jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_listing_drafts_generation_status_chk'
      and conrelid = 'public.workspace_listing_drafts'::regclass
  ) then
    alter table public.workspace_listing_drafts
      add constraint workspace_listing_drafts_generation_status_chk
      check (
        generation_status is null
        or generation_status in ('pending', 'processing', 'completed', 'failed')
      );
  end if;
end $$;

create unique index if not exists workspace_listing_drafts_job_id_uidx
  on public.workspace_listing_drafts (job_id)
  where job_id is not null;

comment on column public.workspace_listing_drafts.job_id is
  'Async listing generation job id — returned as 202 Accepted from POST /api/listings/generate.';

comment on column public.workspace_listing_drafts.generation_status is
  'Async job lifecycle: pending → processing → completed | failed.';
