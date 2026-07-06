-- Granular listing generation cost telemetry (EN/AR workspaces).

create table if not exists public.listing_generation_costs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  queue_hash text not null,
  phase text not null check (phase in ('title', 'short', 'long', 'full')),
  tokens_used integer not null default 0 check (tokens_used >= 0),
  credit_cost numeric(10, 4) not null default 0 check (credit_cost >= 0),
  created_at timestamptz not null default now(),
  constraint listing_generation_costs_queue_hash_len check (
    char_length(queue_hash) = 64
  )
);

create index if not exists listing_generation_costs_workspace_created_idx
  on public.listing_generation_costs (workspace_id, created_at desc);

create index if not exists listing_generation_costs_workspace_phase_idx
  on public.listing_generation_costs (workspace_id, phase);

comment on table public.listing_generation_costs is
  'Per-phase Gemini token + credit usage for listing optimizer transparency dashboards.';

alter table public.listing_generation_costs enable row level security;

drop policy if exists "listing_generation_costs_select_member"
  on public.listing_generation_costs;
create policy "listing_generation_costs_select_member"
  on public.listing_generation_costs for select
  using (public.is_workspace_member(workspace_id));
