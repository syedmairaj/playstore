-- Core app pages: plan, onboarding state, app fields, invitations, workspace delete.

alter table public.workspaces
  add column if not exists plan text default 'starter';

update public.workspaces set plan = 'starter' where plan is null;

alter table public.workspaces
  alter column plan set not null;

alter table public.workspaces
  add column if not exists onboarding_state jsonb;

alter table public.apps
  add column if not exists play_store_url text,
  add column if not exists target_countries text[] default array['US']::text[];

create table if not exists public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member')),
  invited_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

drop index if exists workspace_invitations_workspace_email_idx;

create unique index workspace_invitations_workspace_email_idx
  on public.workspace_invitations (workspace_id, lower(trim(email)));

alter table public.workspace_invitations enable row level security;

drop policy if exists "workspace_invitations_select_member" on public.workspace_invitations;
create policy "workspace_invitations_select_member"
  on public.workspace_invitations for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_invitations_insert_admin" on public.workspace_invitations;
create policy "workspace_invitations_insert_admin"
  on public.workspace_invitations for insert
  with check (
    public.is_workspace_member(workspace_id)
    and public.workspace_role(workspace_id) in ('owner', 'admin')
    and invited_by = auth.uid()
  );

drop policy if exists "workspace_invitations_delete_admin" on public.workspace_invitations;
create policy "workspace_invitations_delete_admin"
  on public.workspace_invitations for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.workspace_role(workspace_id) in ('owner', 'admin')
  );

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
  on public.workspaces for delete
  using (public.workspace_role(id) = 'owner');

alter table public.profiles
  add column if not exists notification_preferences jsonb default '{}'::jsonb;
