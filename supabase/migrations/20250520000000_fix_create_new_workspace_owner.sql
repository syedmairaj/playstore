-- Ensure workspace owner FK (workspaces.created_by) and owner membership row are always set
-- from the caller JWT. Uses (select auth.uid()) per Supabase guidance for stable JWT reads
-- inside SECURITY DEFINER functions.

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
  'SECURITY DEFINER: creates workspace with workspaces.created_by = auth.uid(), owner workspace_members row (on conflict do nothing), default app, sample listing_generation; returns workspace id.';
