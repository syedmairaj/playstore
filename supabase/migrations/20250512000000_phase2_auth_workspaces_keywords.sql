-- Phase 2: profiles, workspaces, memberships, apps, keywords, ranks, alerts, RLS.
-- Run in Supabase SQL Editor (postgres) or supabase db push.
-- Requires Supabase Auth (email provider enabled).

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Workspaces & membership
-- ---------------------------------------------------------------------------
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists workspaces_created_by_idx on public.workspaces (created_by);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- Add owner row when a workspace is created
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute procedure public.handle_new_workspace();

-- Helper for RLS (SECURITY DEFINER to avoid recursive policy checks)
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_member(uuid) to service_role;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select wm.role
  from public.workspace_members wm
  where wm.workspace_id = p_workspace_id
    and wm.user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.workspace_role(uuid) from public;
grant execute on function public.workspace_role(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to service_role;

alter table public.workspaces enable row level security;

create policy "workspaces_select_member"
  on public.workspaces for select
  using (public.is_workspace_member(id));

create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (auth.uid() is not null and created_by = auth.uid());

create policy "workspaces_update_admin"
  on public.workspaces for update
  using (
    public.is_workspace_member(id)
    and public.workspace_role(id) in ('owner', 'admin')
  );

alter table public.workspace_members enable row level security;

create policy "workspace_members_select_roster"
  on public.workspace_members for select
  using (
    exists (
      select 1
      from public.workspace_members me
      where me.workspace_id = workspace_members.workspace_id
        and me.user_id = auth.uid()
    )
  );

-- Must run after workspace_members exists (policy references that table).
create policy "profiles_select_workspace_peers"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.workspace_members me
      join public.workspace_members peer
        on peer.workspace_id = me.workspace_id
      where me.user_id = auth.uid()
        and peer.user_id = profiles.id
    )
  );

-- ---------------------------------------------------------------------------
-- Apps (workspace-scoped; default app created by app layer)
-- ---------------------------------------------------------------------------
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  package_name text,
  created_at timestamptz not null default now()
);

create index if not exists apps_workspace_idx on public.apps (workspace_id);

alter table public.apps enable row level security;

create policy "apps_select_member"
  on public.apps for select using (public.is_workspace_member(workspace_id));

create policy "apps_insert_member"
  on public.apps for insert with check (public.is_workspace_member(workspace_id));

create policy "apps_update_member"
  on public.apps for update using (public.is_workspace_member(workspace_id));

create policy "apps_delete_admin"
  on public.apps for delete
  using (
    public.is_workspace_member(workspace_id)
    and public.workspace_role(workspace_id) in ('owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- Keywords & rank history (Google Play–oriented; ranks ingested via API/job)
-- ---------------------------------------------------------------------------
create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  app_id uuid not null references public.apps (id) on delete cascade,
  term text not null,
  market text not null default 'us',
  locale text not null default 'en-US',
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists keywords_unique_term_per_app
  on public.keywords (workspace_id, app_id, lower(trim(term)), market);

create index if not exists keywords_workspace_idx on public.keywords (workspace_id);

alter table public.keywords enable row level security;

create policy "keywords_select_member"
  on public.keywords for select using (public.is_workspace_member(workspace_id));

create policy "keywords_insert_member"
  on public.keywords for insert with check (public.is_workspace_member(workspace_id));

create policy "keywords_update_member"
  on public.keywords for update using (public.is_workspace_member(workspace_id));

create policy "keywords_delete_member"
  on public.keywords for delete using (public.is_workspace_member(workspace_id));

create table if not exists public.keyword_ranks (
  id bigserial primary key,
  keyword_id uuid not null references public.keywords (id) on delete cascade,
  rank int,
  captured_at timestamptz not null default now(),
  source text not null default 'manual'
);

create index if not exists keyword_ranks_keyword_time_idx
  on public.keyword_ranks (keyword_id, captured_at desc);

alter table public.keyword_ranks enable row level security;

create policy "keyword_ranks_select_member"
  on public.keyword_ranks for select
  using (
    exists (
      select 1
      from public.keywords k
      where k.id = keyword_ranks.keyword_id
        and public.is_workspace_member(k.workspace_id)
    )
  );

create policy "keyword_ranks_insert_member"
  on public.keyword_ranks for insert
  with check (
    exists (
      select 1
      from public.keywords k
      where k.id = keyword_ranks.keyword_id
        and public.is_workspace_member(k.workspace_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Workspace alerts (keyword-driven in Phase 2)
-- ---------------------------------------------------------------------------
create table if not exists public.workspace_alerts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  keyword_id uuid references public.keywords (id) on delete set null,
  type text not null check (type in ('rank_drop', 'rank_threshold')),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning')),
  read_at timestamptz,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workspace_alerts_workspace_time_idx
  on public.workspace_alerts (workspace_id, created_at desc);

alter table public.workspace_alerts enable row level security;

create policy "workspace_alerts_select_member"
  on public.workspace_alerts for select
  using (public.is_workspace_member(workspace_id));

create policy "workspace_alerts_insert_member"
  on public.workspace_alerts for insert
  with check (public.is_workspace_member(workspace_id));

create policy "workspace_alerts_update_member"
  on public.workspace_alerts for update
  using (public.is_workspace_member(workspace_id));

-- ---------------------------------------------------------------------------
-- Listing generations: workspace + user ownership (Phase 2)
-- ---------------------------------------------------------------------------
alter table public.listing_generations
  add column if not exists workspace_id uuid references public.workspaces (id) on delete cascade;

alter table public.listing_generations
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists listing_generations_workspace_idx
  on public.listing_generations (workspace_id, created_at desc);

-- Replace wide-open RLS with tenant-scoped policies for authenticated users.
drop policy if exists "listing_generations_service" on public.listing_generations;

create policy "listing_generations_select_member"
  on public.listing_generations for select
  to authenticated
  using (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
  );

create policy "listing_generations_insert_member"
  on public.listing_generations for insert
  to authenticated
  with check (
    workspace_id is not null
    and user_id = auth.uid()
    and public.is_workspace_member(workspace_id)
  );
