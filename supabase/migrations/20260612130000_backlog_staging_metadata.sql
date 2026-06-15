-- Staging lifecycle metadata for workspace_listing_backlog (Common Issues → Optimizer).

alter table public.workspace_listing_backlog
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.workspace_listing_backlog.metadata is
  'Staging metadata: competitor_name, staged_at, original_impact_score, quote, category, queue_item_id, archive_reason, source_type';

create index if not exists idx_backlog_metadata_archive_reason
  on public.workspace_listing_backlog ((metadata->>'archive_reason'))
  where is_implemented = true;
