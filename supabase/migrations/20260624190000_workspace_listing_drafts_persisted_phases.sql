-- Track which modular phases have been DB-persisted for each draft row.
-- Used by the worker executor to guard the 'full' generation step at the
-- database level — prevents 500s when the orchestrator's phase-order check
-- fires because the client skipped individual phase generation.
--
-- Safe for both EN and AR vault branches; the upsert logic is locale-agnostic.

alter table public.workspace_listing_drafts
  add column if not exists persisted_phases jsonb
    default '{"title": false, "short": false, "long": false}'::jsonb;

comment on column public.workspace_listing_drafts.persisted_phases is
  'Tracks which modular phases (title, short, long) have been individually persisted '
  'to this draft row.  Updated atomically on every upsert. '
  'Used by the worker executor to gate the full/finalize generation step.';

-- Backfill existing rows from the modular_listing JSONB snapshot so the column
-- is never unexpectedly NULL on rows that already have content.
update public.workspace_listing_drafts
set persisted_phases = jsonb_build_object(
  'title',
    coalesce(length(trim(modular_listing->'title'->>'value')) > 0, false),
  'short',
    coalesce(jsonb_array_length(modular_listing->'shortDescription'->'variations') > 0, false),
  'long',
    coalesce(
      length(trim(coalesce(modular_listing->'longDescription'->>'hook',     ''))) > 0 or
      length(trim(coalesce(modular_listing->'longDescription'->>'features', ''))) > 0 or
      length(trim(coalesce(modular_listing->'longDescription'->>'closing',  ''))) > 0,
      false
    )
)
where modular_listing is not null
  and (
    persisted_phases is null
    or persisted_phases = '{"title": false, "short": false, "long": false}'::jsonb
  );
