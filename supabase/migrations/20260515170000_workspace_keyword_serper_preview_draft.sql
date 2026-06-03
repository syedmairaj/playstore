-- Per-user, per-workspace draft of the Keyword Tracker Serper live preview (JSON payload).
-- Lets previews survive refresh / navigation for the same member without sharing across users.

create table if not exists public.workspace_keyword_serper_preview_drafts (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_keyword_serper_preview_drafts_user_idx
  on public.workspace_keyword_serper_preview_drafts (user_id);

comment on table public.workspace_keyword_serper_preview_drafts is
  'Caches the latest Keyword Tracker Serper preview (per auth user per workspace). RLS: own row only.';

alter table public.workspace_keyword_serper_preview_drafts enable row level security;

create policy "workspace_keyword_serper_preview_drafts_select_own"
  on public.workspace_keyword_serper_preview_drafts for select
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "workspace_keyword_serper_preview_drafts_upsert_own"
  on public.workspace_keyword_serper_preview_drafts for insert
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "workspace_keyword_serper_preview_drafts_update_own"
  on public.workspace_keyword_serper_preview_drafts for update
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );

create policy "workspace_keyword_serper_preview_drafts_delete_own"
  on public.workspace_keyword_serper_preview_drafts for delete
  using (
    user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );
