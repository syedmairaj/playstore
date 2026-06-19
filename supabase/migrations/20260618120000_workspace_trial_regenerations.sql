-- Workspace-scoped trial quota for modular listing regenerates (first 3 free, then 1 credit each).

alter table public.workspaces
  add column if not exists trial_regenerations_used integer not null default 0;

alter table public.workspaces
  drop constraint if exists workspaces_trial_regenerations_used_nonneg_chk;

alter table public.workspaces
  add constraint workspaces_trial_regenerations_used_nonneg_chk
  check (trial_regenerations_used >= 0);

comment on column public.workspaces.trial_regenerations_used is
  'Count of paid-path-eligible modular listing regenerate clicks consumed from the workspace trial (first 3 are free).';

-- Atomic: increment trial counter OR debit 1 text-generation credit with ledger row.
create or replace function public.consume_modular_listing_regenerate(
  p_workspace_id uuid,
  p_user_id uuid,
  p_generation_step text,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trial_used integer;
  v_remaining integer;
  v_ledger_id uuid;
  v_meta jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select w.trial_regenerations_used, w.ai_credits_remaining
  into v_trial_used, v_remaining
  from public.workspaces w
  where w.id = p_workspace_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'workspace_not_found');
  end if;

  if v_trial_used < 3 then
    update public.workspaces
    set trial_regenerations_used = trial_regenerations_used + 1
    where id = p_workspace_id
    returning trial_regenerations_used into v_trial_used;

    return jsonb_build_object(
      'ok', true,
      'trial_slot', true,
      'trial_regenerations_used', v_trial_used,
      'trial_regenerations_remaining', greatest(0, 3 - v_trial_used),
      'credits_charged', 0,
      'balance_after', v_remaining,
      'ledger_id', null
    );
  end if;

  if v_remaining < 1 then
    return jsonb_build_object(
      'ok', false,
      'code', 'insufficient_credits',
      'remaining', v_remaining,
      'required', 1,
      'trial_regenerations_used', v_trial_used
    );
  end if;

  update public.workspaces
  set ai_credits_remaining = ai_credits_remaining - 1
  where id = p_workspace_id;

  v_meta := coalesce(p_meta, '{}'::jsonb) || jsonb_build_object(
    'generation_type', 'text',
    'generation_step', p_generation_step,
    'billing_kind', 'modular_regenerate'
  );

  insert into public.credits_ledger (workspace_id, user_id, amount, description, source_type, meta)
  values (
    p_workspace_id,
    p_user_id,
    -1,
    'Modular listing regenerate (' || coalesce(p_generation_step, 'block') || ')',
    'generation',
    v_meta
  )
  returning id into v_ledger_id;

  select w.ai_credits_remaining into v_remaining
  from public.workspaces w
  where w.id = p_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'trial_slot', false,
    'trial_regenerations_used', v_trial_used,
    'trial_regenerations_remaining', 0,
    'credits_charged', 1,
    'balance_after', v_remaining,
    'ledger_id', v_ledger_id
  );
end;
$$;

revoke all on function public.consume_modular_listing_regenerate(uuid, uuid, text, jsonb) from public;
grant execute on function public.consume_modular_listing_regenerate(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.consume_modular_listing_regenerate(uuid, uuid, text, jsonb) to service_role;
