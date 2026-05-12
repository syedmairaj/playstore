-- Repair environments where public.create_new_workspace(text) was never applied or PostgREST
-- could not see it. Harden owner membership: trigger uses ON CONFLICT DO NOTHING; RPC adds a
-- defensive owner row so the workspace is usable even if the trigger was missing.

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end;
$$;

drop function if exists public.create_new_workspace(text);

create function public.create_new_workspace(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_trim text := trim(p_name);
  v_uid uuid := auth.uid();
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
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if length(v_trim) < 2 then
    raise exception 'invalid_name';
  end if;

  insert into public.workspaces (
    name,
    created_by,
    onboarding_state,
    plan,
    ai_credits_remaining,
    ai_credits_monthly_allocation
  )
  values (
    v_trim,
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
  'SECURITY DEFINER: creates workspace for auth.uid(), owner membership, default app, sample listing_generation; returns workspace id.';
