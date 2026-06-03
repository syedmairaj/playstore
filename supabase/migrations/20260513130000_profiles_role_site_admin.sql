-- Site-wide admin via `profiles.role = 'admin'` (in addition to `is_admin`).
-- Keeps `admin_financial_snapshot` aligned with app middleware / `lib/admin/gate.ts`.

alter table public.profiles
  add column if not exists role text null;

comment on column public.profiles.role is
  'Optional site-wide role; when ''admin'', user is a site operator (same effect as is_admin true for gates and admin_financial_snapshot).';

create or replace function public.admin_financial_snapshot(
  p_series_from date default null,
  p_series_to date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_from date;
  v_to date;
  v_workspaces jsonb;
  v_series jsonb;
  v_totals jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'unauthorized');
  end if;

  select coalesce(p.is_admin, false) or coalesce(p.role, '') = 'admin'
  into v_admin
  from public.profiles p
  where p.id = v_uid;

  if not v_admin then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  v_from := coalesce(p_series_from, (current_date - interval '29 days')::date);
  v_to := coalesce(p_series_to, current_date);

  if v_to < v_from then
    return jsonb_build_object('ok', false, 'code', 'invalid_range');
  end if;

  select coalesce(jsonb_agg(to_jsonb(ws)), '[]'::jsonb)
  into v_workspaces
  from (
    select
      w.id,
      w.name,
      w.plan,
      w.ai_credits_remaining,
      w.created_at,
      w.owner_id,
      p.display_name as owner_display_name,
      coalesce((
        select sum(-c.amount)::bigint
        from public.credits_ledger c
        where c.workspace_id = w.id
          and c.amount < 0
      ), 0) as credits_spent_total,
      coalesce((
        select sum(c.amount)::bigint
        from public.credits_ledger c
        where c.workspace_id = w.id
          and c.amount > 0
          and c.source_type = 'purchase'
      ), 0) as credits_purchased_total,
      (
        select count(*)::int
        from public.listing_generations lg
        where lg.workspace_id = w.id
      ) as listing_generations_total,
      (
        select count(*)::int
        from public.credits_ledger c
        where c.workspace_id = w.id
          and c.amount < 0
          and (
            coalesce(c.meta ->> 'tool', '') = 'listing_logo_generation'
            or lower(c.description) like '%runware%'
          )
      ) as logo_batches_total
    from public.workspaces w
    left join public.profiles p on p.id = w.owner_id
    order by w.created_at desc
    limit 50
  ) ws;

  with days as (
    select generate_series(v_from, v_to, interval '1 day')::date as day
  ),
  lg as (
    select
      (created_at at time zone 'UTC')::date as day,
      count(*)::int as listing_aso_count
    from public.listing_generations
    where (created_at at time zone 'UTC')::date between v_from and v_to
      and coalesce(tool_type, 'aso_listing') = 'aso_listing'
    group by 1
  ),
  ld as (
    select
      (created_at at time zone 'UTC')::date as day,
      count(*) filter (
        where amount < 0
          and (
            coalesce(meta ->> 'tool', '') = 'listing_logo_generation'
            or lower(description) like '%runware%'
          )
      )::int as logo_batches,
      coalesce(
        sum(-amount) filter (
          where amount < 0
            and lower(description) like 'listing optimizer ai autofill%'
        ),
        0
      )::bigint as autofill_credits,
      coalesce(
        sum(-amount) filter (
          where amount < 0
            and lower(description) like 'add app ai suggest%'
        ),
        0
      )::bigint as suggest_credits,
      coalesce(
        sum(-amount) filter (
          where amount < 0
            and lower(description) like 'listing ai generation%'
        ),
        0
      )::bigint as listing_ledger_credits,
      coalesce(
        sum(-amount) filter (
          where amount < 0
            and source_type = 'generation'
            and not (
              coalesce(meta ->> 'tool', '') = 'listing_logo_generation'
              or lower(description) like '%runware%'
            )
            and lower(description) not like 'listing optimizer ai autofill%'
            and lower(description) not like 'add app ai suggest%'
            and lower(description) not like 'listing ai generation%'
        ),
        0
      )::bigint as other_generation_credits,
      coalesce(
        sum(amount) filter (
          where amount > 0
            and source_type = 'purchase'
        ),
        0
      )::bigint as credits_purchased_day
    from public.credits_ledger
    where (created_at at time zone 'UTC')::date between v_from and v_to
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.day,
        'listing_aso_count', coalesce(lg.listing_aso_count, 0),
        'logo_batches', coalesce(ld.logo_batches, 0),
        'autofill_credits', coalesce(ld.autofill_credits, 0),
        'suggest_credits', coalesce(ld.suggest_credits, 0),
        'listing_ledger_credits', coalesce(ld.listing_ledger_credits, 0),
        'other_generation_credits', coalesce(ld.other_generation_credits, 0),
        'credits_purchased', coalesce(ld.credits_purchased_day, 0)
      )
      order by d.day
    ),
    '[]'::jsonb
  )
  into v_series
  from days d
  left join lg on lg.day = d.day
  left join ld on ld.day = d.day;

  select jsonb_build_object(
    'credits_purchased_all_time',
    coalesce(
      (
        select sum(amount)::bigint
        from public.credits_ledger
        where amount > 0
          and source_type = 'purchase'
      ),
      0
    ),
    'credits_spent_all_time',
    coalesce(
      (
        select sum(-amount)::bigint
        from public.credits_ledger
        where amount < 0
      ),
      0
    ),
    'listing_generations_all_time',
    (select count(*)::bigint from public.listing_generations),
    'workspace_count',
    (select count(*)::bigint from public.workspaces),
    'has_payments_table',
    false
  )
  into v_totals;

  return jsonb_build_object(
    'ok', true,
    'series_from', v_from,
    'series_to', v_to,
    'workspaces', v_workspaces,
    'daily_series', v_series,
    'totals', v_totals
  );
end;
$$;

revoke all on function public.admin_financial_snapshot(date, date) from public;
grant execute on function public.admin_financial_snapshot(date, date) to authenticated;
grant execute on function public.admin_financial_snapshot(date, date) to service_role;
