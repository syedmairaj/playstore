-- Provider-level COGS breakdown for admin analytics (Gemini token fractions + Serper per-query).

alter table public.admin_ai_transaction_logs
  add column if not exists provider_service text;

alter table public.admin_ai_transaction_logs
  add column if not exists input_tokens integer not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists output_tokens integer not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists input_cost_usd numeric(12, 6) not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists output_cost_usd numeric(12, 6) not null default 0;

alter table public.admin_ai_transaction_logs
  add column if not exists raw_cogs_usd numeric(12, 6);

-- Backfill from legacy columns when present.
update public.admin_ai_transaction_logs
set
  input_tokens = coalesce(nullif(input_tokens, 0), prompt_tokens, 0),
  output_tokens = coalesce(nullif(output_tokens, 0), completion_tokens, 0),
  raw_cogs_usd = coalesce(raw_cogs_usd, raw_usd_cost, 0),
  provider_service = coalesce(provider_service, 'gemini')
where raw_cogs_usd is null
   or provider_service is null
   or input_tokens = 0 and prompt_tokens > 0;

alter table public.admin_ai_transaction_logs
  alter column raw_cogs_usd set default 0;

update public.admin_ai_transaction_logs
set raw_cogs_usd = coalesce(raw_cogs_usd, 0)
where raw_cogs_usd is null;

alter table public.admin_ai_transaction_logs
  alter column raw_cogs_usd set not null;

-- Keep raw_usd_cost aligned for older readers.
update public.admin_ai_transaction_logs
set raw_usd_cost = raw_cogs_usd
where raw_usd_cost is distinct from raw_cogs_usd;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_ai_transaction_logs_provider_service_check'
  ) then
    alter table public.admin_ai_transaction_logs
      add constraint admin_ai_transaction_logs_provider_service_check
      check (provider_service is null or provider_service in ('gemini', 'serper'));
  end if;
end $$;

create index if not exists admin_ai_transaction_logs_provider_service_idx
  on public.admin_ai_transaction_logs (provider_service);
