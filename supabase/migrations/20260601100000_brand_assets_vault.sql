-- ---------------------------------------------------------------------------
-- Brand Assets Vault
-- Stores metadata for AI-generated icons, banners, and future screenshots.
-- Files are stored in Supabase Storage bucket: brand-assets (private).
-- Signed URLs are generated on-demand server-side; no public URLs stored.
-- ---------------------------------------------------------------------------

create table if not exists public.brand_assets (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  app_id        uuid references public.apps (id) on delete set null,
  user_id       uuid references auth.users (id) on delete set null,

  -- Asset classification
  asset_type    text not null,    -- 'icon' | 'banner'
  variant_index smallint,         -- 0-3 within a generation batch

  -- Storage
  storage_path  text not null,    -- bucket-relative path e.g. workspaces/{wid}/icons/{uuid}.png
  file_name     text not null,    -- original download filename
  mime_type     text not null default 'image/png',
  size_bytes    integer,

  -- Generation context (what produced this asset)
  meta          jsonb,            -- style, brandColor, customPrompt, promptHash, etc.

  constraint brand_assets_type_chk check (
    asset_type in ('icon', 'banner')
  )
);

create index if not exists brand_assets_workspace_created_idx
  on public.brand_assets (workspace_id, created_at desc);

create index if not exists brand_assets_app_idx
  on public.brand_assets (app_id, asset_type, created_at desc);

comment on table public.brand_assets is
  'Metadata for AI-generated brand assets (icons, banners). Files live in Supabase Storage bucket brand-assets.';

-- ---------------------------------------------------------------------------
-- RLS: workspace members can read/delete their own workspace assets.
-- Inserts are done server-side via service role only.
-- ---------------------------------------------------------------------------
alter table public.brand_assets enable row level security;

create policy "brand_assets_select_member"
  on public.brand_assets
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

create policy "brand_assets_delete_member"
  on public.brand_assets
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Supabase Storage bucket: brand-assets
-- Private bucket — all access via server-generated signed URLs.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  false,
  5242880,   -- 5 MB max per file
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS: service role handles uploads via signed URLs.
-- Authenticated users cannot directly read/write — only via signed URLs.
create policy "brand_assets_storage_select"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'workspaces');

create policy "brand_assets_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'brand-assets' and (storage.foldername(name))[1] = 'workspaces');
