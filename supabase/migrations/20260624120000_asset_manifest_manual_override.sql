-- ─────────────────────────────────────────────────────────────────────────────
-- Add is_manually_overridden to workspace_asset_manifests
--
-- When true the auto-sync engine (syncBrandKitToMockup) skips this manifest.
-- Set by the UI when a user manually customises an asset on a specific mockup.
-- Cleared when the user clicks "Revert to Brand Assets" (force-sync with
-- force = true).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.workspace_asset_manifests
  add column if not exists is_manually_overridden boolean not null default false;

comment on column public.workspace_asset_manifests.is_manually_overridden is
  'When true, syncBrandKitToMockup skips this manifest during auto-replication.
   Cleared automatically when the user triggers a force-revert ("Revert to
   Brand Assets").';

-- Partial index so the auto-sync query can quickly filter out overridden rows
create index if not exists workspace_asset_manifests_override_idx
  on public.workspace_asset_manifests (workspace_id, is_manually_overridden)
  where is_manually_overridden = true;

-- Trigger: keep updated_at current whenever the row changes.
-- Uses an inline function rather than moddatetime() to avoid requiring that
-- extension to be enabled.
create or replace function public.set_updated_at_workspace_asset_manifests()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'workspace_asset_manifests_set_updated_at'
  ) then
    create trigger workspace_asset_manifests_set_updated_at
      before update on public.workspace_asset_manifests
      for each row execute procedure public.set_updated_at_workspace_asset_manifests();
  end if;
end $$;
