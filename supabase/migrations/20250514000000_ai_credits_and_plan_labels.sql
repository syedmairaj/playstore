-- AI credits per workspace + map legacy plan names to new tiers (free / pro / growth).

alter table public.workspaces
  add column if not exists ai_credits_remaining integer,
  add column if not exists ai_credits_monthly_allocation integer;

-- Default allocation from plan (app layer can still sync)
update public.workspaces
set
  ai_credits_monthly_allocation = case
    when plan in ('pro') then 200
    when plan in ('agency', 'growth') then 800
    else 20
  end,
  ai_credits_remaining = coalesce(
    ai_credits_remaining,
    case
      when plan in ('pro') then 200
      when plan in ('agency', 'growth') then 800
      else 20
    end
  )
where ai_credits_remaining is null or ai_credits_monthly_allocation is null;

alter table public.workspaces
  alter column ai_credits_remaining set default 20,
  alter column ai_credits_monthly_allocation set default 20;

update public.workspaces set plan = 'free' where plan = 'starter';
update public.workspaces set plan = 'growth' where plan = 'agency';
