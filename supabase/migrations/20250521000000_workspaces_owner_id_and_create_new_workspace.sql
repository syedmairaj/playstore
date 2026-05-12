-- Canonical workspace owner: owner_id (FK) + created_by (historical column).
-- Backfill owner_id from created_by, enforce NOT NULL, keep columns in sync, and
-- harden public.create_new_workspace so auth.uid() is never stored as NULL.

-- ---------------------------------------------------------------------------
-- DDL: owner_id
-- ---------------------------------------------------------------------------
alter table public.workspaces
  add column if not exists owner_id uuid references auth.users (id) on delete restrict;

update public.workspaces
set owner_id = created_by
where owner_id is null;

alter table public.workspaces
  alter column owner_id set not null;

create index if not exists workspaces_owner_id_idx on public.workspaces (owner_id);

comment on column public.workspaces.owner_id is
  'Workspace owner user id; must equal created_by. Kept in sync via workspaces_owner_columns_sync trigger.';

-- ---------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE: mirror owner_id <-> created_by; reject mismatch
-- ---------------------------------------------------------------------------
create or replace function public.workspaces_owner_columns_sync()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.owner_id is null and new.created_by is not null then
    new.owner_id := new.created_by;
  elsif new.created_by is null and new.owner_id is not null then
    new.created_by := new.owner_id;
  elsif new.owner_id is not null
    and new.created_by is not null
    and new.owner_id is distinct from new.created_by then
    raise exception 'workspaces: owner_id and created_by must be the same user';
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_owner_columns_sync on public.workspaces;
create trigger workspaces_owner_columns_sync
  before insert or update of owner_id, created_by on public.workspaces
  for each row
  execute procedure public.workspaces_owner_columns_sync();

-- ---------------------------------------------------------------------------
-- Owner membership row: use coalesce for trigger + any partial-row edge cases
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid := coalesce(new.owner_id, new.created_by);
begin
  if v_owner is null then
    raise exception 'handle_new_workspace: owner_id and created_by are both null';
  end if;
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, v_owner, 'owner');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: inserts must declare caller as both owner_id and created_by
-- ---------------------------------------------------------------------------
drop policy if exists "workspaces_insert_authenticated" on public.workspaces;
create policy "workspaces_insert_authenticated"
  on public.workspaces for insert
  with check (
    auth.uid() is not null
    and created_by = auth.uid()
    and owner_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- RPC: set both columns, defensive owner row, fail fast if no JWT user
-- ---------------------------------------------------------------------------
create or replace function public.create_new_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_trim text := trim(p_name);
  v_uid uuid;
  v_output jsonb := jsonb_build_object(
    'title', 'Sample App — calm productivity for teams',
    'shortDescription',
    'Demo draft — open Listing Optimizer to generate your real Play copy.',
    'fullDescription',
    'This seeded preview keeps your Growth Hub from looking empty. Open Listing Optimizer, paste your app name, category, and keywords, then generate Google Play–ready copy in one pass.',
    'keywordSuggestions', jsonb_build_array('google play aso', 'indie android', 'keyword tracking', 'listing optimizer', 'sample'),
    'ctaSuggestions', jsonb_build_array('Start free trial', 'See pricing', 'Optimize listing')
  );
begin
  v_uid := (select auth.uid());

  if v_uid is null then
    raise exception 'create_new_workspace: authenticated session required (auth.uid() is null)';
  end if;

  if length(v_trim) < 2 then
    raise exception 'create_new_workspace: workspace name must be at least 2 characters after trim';
  end if;

  insert into public.workspaces (
    name,
    created_by,
    owner_id,
    onboarding_state,
    plan,
    ai_credits_remaining,
    ai_credits_monthly_allocation
  )
  values (
    v_trim,
    v_uid,
    v_uid,
    jsonb_build_object('completed', true, 'version', 1, 'bootstrapped', true),
    'free',
    20,
    20
  )
  returning id into v_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_id, v_uid, 'owner')
  on conflict (workspace_id, user_id) do nothing;

  insert into public.apps (workspace_id, name)
  values (v_id, 'Sample App (demo)');

  insert into public.listing_generations (
    app_name,
    category,
    target_keywords,
    app_features,
    tone_style,
    client_ip,
    model,
    output_json,
    prompt_version,
    workspace_id,
    user_id,
    tool_type
  )
  values (
    'Sample App',
    'Productivity',
    array['google play', 'aso', 'sample']::text[],
    'Seeded demo listing for your new workspace.',
    'friendly',
    '',
    'seed',
    v_output,
    'workspace-bootstrap-v1',
    v_id,
    v_uid,
    'aso_listing'
  );

  return v_id;
end;
$$;

revoke all on function public.create_new_workspace(text) from public;
grant execute on function public.create_new_workspace(text) to authenticated;
grant execute on function public.create_new_workspace(text) to service_role;

comment on function public.create_new_workspace(text) is
  'SECURITY DEFINER: creates workspace with created_by and owner_id = auth.uid(), owner workspace_members row (on conflict do nothing), default app, sample listing_generation; returns workspace id.';
