-- Drop legacy one-draft-per-workspace unique constraint.
-- Current schema keys drafts by (workspace_id, queue_hash); the old
-- workspace_id-only unique blocks inserts when the vault hash changes.

alter table public.workspace_listing_drafts
  drop constraint if exists workspace_listing_drafts_workspace_id_key;

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
