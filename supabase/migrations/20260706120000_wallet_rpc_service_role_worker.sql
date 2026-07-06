-- Allow QStash/async listing workers (service_role, auth.uid() IS NULL) to debit/refund
-- credits on behalf of the enqueueing user. Interactive routes still require auth.uid() = p_user_id.

create or replace function public.consume_workspace_ai_credits(
  p_workspace_id uuid,
  p_user_id uuid,
  p_amount integer,
  p_description text,
  p_source_type text,
  p_meta jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining integer;
  v_ledger_id uuid;
begin
  if coalesce(auth.jwt()->>'role', auth.role()) = 'service_role' then
    if not public.is_workspace_member(p_workspace_id, p_user_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  elsif auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  elsif not public.is_workspace_member(p_workspace_id, p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if p_amount is null or p_amount < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  if p_source_type is null
     or p_source_type not in ('generation', 'purchase', 'refund', 'adjustment') then
    return jsonb_build_object('ok', false, 'code', 'invalid_source_type');
  end if;

  select w.ai_credits_remaining into v_remaining
  from public.workspaces w
  where w.id = p_workspace_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'workspace_not_found');
  end if;

  if v_remaining < p_amount then
    return jsonb_build_object(
      'ok', false,
      'code', 'insufficient_credits',
      'remaining', v_remaining,
      'required', p_amount
    );
  end if;

  update public.workspaces
  set ai_credits_remaining = ai_credits_remaining - p_amount
  where id = p_workspace_id;

  insert into public.credits_ledger (workspace_id, user_id, amount, description, source_type, meta)
  values (
    p_workspace_id,
    p_user_id,
    -p_amount,
    p_description,
    p_source_type,
    p_meta
  )
  returning id into v_ledger_id;

  select w.ai_credits_remaining into v_remaining
  from public.workspaces w
  where w.id = p_workspace_id;

  return jsonb_build_object(
    'ok', true,
    'ledger_id', v_ledger_id,
    'balance_after', v_remaining
  );
end;
$$;

create or replace function public.refund_workspace_ai_credits(
  p_ledger_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credits_ledger%rowtype;
  v_refund integer;
  v_ledger_id uuid;
  v_remaining integer;
  v_service_role boolean := coalesce(auth.jwt()->>'role', auth.role()) = 'service_role';
begin
  if v_service_role then
    null;
  elsif auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  select * into v_row
  from public.credits_ledger
  where id = p_ledger_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ledger_not_found');
  end if;

  if v_service_role then
    if not public.is_workspace_member(v_row.workspace_id, p_user_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  elsif not public.is_workspace_member(v_row.workspace_id, p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  if v_row.amount >= 0 then
    return jsonb_build_object('ok', false, 'code', 'not_a_debit');
  end if;

  if exists (
    select 1
    from public.credits_ledger c
    where c.workspace_id = v_row.workspace_id
      and c.source_type = 'refund'
      and c.meta ->> 'refunded_ledger_id' = p_ledger_id::text
  ) then
    return jsonb_build_object('ok', false, 'code', 'already_refunded');
  end if;

  if v_row.user_id is not null and v_row.user_id is distinct from p_user_id then
    return jsonb_build_object('ok', false, 'code', 'user_mismatch');
  end if;

  v_refund := -v_row.amount;

  update public.workspaces
  set ai_credits_remaining = ai_credits_remaining + v_refund
  where id = v_row.workspace_id;

  insert into public.credits_ledger (workspace_id, user_id, amount, description, source_type, meta)
  values (
    v_row.workspace_id,
    p_user_id,
    v_refund,
    coalesce(nullif(trim(p_reason), ''), 'Refund: AI generation failed'),
    'refund',
    jsonb_build_object('refunded_ledger_id', p_ledger_id)
  )
  returning id into v_ledger_id;

  select w.ai_credits_remaining into v_remaining
  from public.workspaces w
  where w.id = v_row.workspace_id;

  return jsonb_build_object(
    'ok', true,
    'refund_ledger_id', v_ledger_id,
    'balance_after', v_remaining
  );
end;
$$;

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
  if coalesce(auth.jwt()->>'role', auth.role()) = 'service_role' then
    if not public.is_workspace_member(p_workspace_id, p_user_id) then
      return jsonb_build_object('ok', false, 'code', 'forbidden');
    end if;
  elsif auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  elsif not public.is_workspace_member(p_workspace_id, p_user_id) then
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
