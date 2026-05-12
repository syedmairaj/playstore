-- Workspace wallet: immutable credits_ledger + atomic consume/refund RPCs.
-- Listing AI debits before Gemini runs; refund RPC reverses on generation failure.

create table if not exists public.credits_ledger (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  amount integer not null,
  description text not null,
  source_type text not null,
  meta jsonb,
  constraint credits_ledger_source_type_chk check (
    source_type in ('generation', 'purchase', 'refund', 'adjustment')
  )
);

create index if not exists credits_ledger_workspace_created_idx
  on public.credits_ledger (workspace_id, created_at desc);

comment on table public.credits_ledger is 'Append-only workspace credit movements; negative amount = spend, positive = grant/refund.';

alter table public.credits_ledger enable row level security;

create policy "credits_ledger_select_member"
  on public.credits_ledger
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete for authenticated — rows created only via SECURITY DEFINER RPCs below.

alter table public.listing_generations
  add column if not exists tool_type text not null default 'aso_listing',
  add column if not exists credits_ledger_id uuid references public.credits_ledger (id) on delete set null;

comment on column public.listing_generations.tool_type is 'AI surface key (aso_listing, ads, push, …).';
comment on column public.listing_generations.credits_ledger_id is 'Spend row in credits_ledger for this generation, if any.';

-- ---------------------------------------------------------------------------
-- consume_workspace_ai_credits: member check, balance check, row lock, debit + ledger insert
-- ---------------------------------------------------------------------------
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
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  if p_amount is null or p_amount < 1 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount');
  end if;

  if p_source_type is null
     or p_source_type not in ('generation', 'purchase', 'refund', 'adjustment') then
    return jsonb_build_object('ok', false, 'code', 'invalid_source_type');
  end if;

  if not public.is_workspace_member(p_workspace_id) then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
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

revoke all on function public.consume_workspace_ai_credits(uuid, uuid, integer, text, text, jsonb) from public;
grant execute on function public.consume_workspace_ai_credits(uuid, uuid, integer, text, text, jsonb) to authenticated;
grant execute on function public.consume_workspace_ai_credits(uuid, uuid, integer, text, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- refund_workspace_ai_credits: reverses a prior spend row (negative amount)
-- ---------------------------------------------------------------------------
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
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  select * into v_row
  from public.credits_ledger
  where id = p_ledger_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'ledger_not_found');
  end if;

  if not public.is_workspace_member(v_row.workspace_id) then
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

revoke all on function public.refund_workspace_ai_credits(uuid, uuid, text) from public;
grant execute on function public.refund_workspace_ai_credits(uuid, uuid, text) to authenticated;
grant execute on function public.refund_workspace_ai_credits(uuid, uuid, text) to service_role;
