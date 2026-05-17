-- ASO baseline + listing-generation ↔ keyword links + ROI improvement alerts (MVP).

-- ---------------------------------------------------------------------------
-- workspace_alerts: allow ASO improvement type
-- ---------------------------------------------------------------------------
alter table public.workspace_alerts
  drop constraint if exists workspace_alerts_type_check;

alter table public.workspace_alerts
  add constraint workspace_alerts_type_check
  check (type in ('rank_drop', 'rank_threshold', 'aso_rank_improvement'));

-- ---------------------------------------------------------------------------
-- keywords: baseline “before”, last listing optimization anchor, recent gain badge
-- ---------------------------------------------------------------------------
alter table public.keywords
  add column if not exists aso_baseline_rank int;

alter table public.keywords
  add column if not exists aso_baseline_captured_at timestamptz;

alter table public.keywords
  add column if not exists aso_baseline_source text;

alter table public.keywords
  drop constraint if exists keywords_aso_baseline_source_check;

alter table public.keywords
  add constraint keywords_aso_baseline_source_check
  check (aso_baseline_source is null or aso_baseline_source in ('initial_save', 'manual'));

alter table public.keywords
  add column if not exists last_listing_optimization_at timestamptz;

alter table public.keywords
  add column if not exists last_listing_optimization_generation_id uuid
    references public.listing_generations (id) on delete set null;

alter table public.keywords
  add column if not exists rank_at_last_listing_optimization int;

alter table public.keywords
  add column if not exists recent_rank_gain int;

alter table public.keywords
  add column if not exists recent_rank_gain_at timestamptz;

create index if not exists keywords_last_listing_opt_gen_idx
  on public.keywords (last_listing_optimization_generation_id)
  where last_listing_optimization_generation_id is not null;

comment on column public.keywords.aso_baseline_rank is
  'First captured primary-market rank when the keyword entered tracking; used as “before” when no optimization anchor exists.';

comment on column public.keywords.last_listing_optimization_generation_id is
  'Latest full AI listing generation linked to this keyword for ROI / before-after correlation.';

comment on column public.keywords.rank_at_last_listing_optimization is
  'Headline primary-market rank snapshot at link time; improvement vs refresh uses this when set, else falls back to aso_baseline_rank.';

comment on column public.keywords.recent_rank_gain is
  'Positive = positions gained (lower rank number is better). Shown in UI when recent_rank_gain_at is within ~7 days.';

-- ---------------------------------------------------------------------------
-- listing_generation_keywords: many-to-many (workspace-scoped for RLS)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_generation_keywords (
  listing_generation_id uuid not null
    references public.listing_generations (id) on delete cascade,
  keyword_id uuid not null
    references public.keywords (id) on delete cascade,
  workspace_id uuid not null
    references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_generation_id, keyword_id)
);

create index if not exists listing_generation_keywords_workspace_idx
  on public.listing_generation_keywords (workspace_id);

create index if not exists listing_generation_keywords_keyword_idx
  on public.listing_generation_keywords (keyword_id);

comment on table public.listing_generation_keywords is
  'Which tracked keywords were active for the app when a listing generation completed; powers ROI alerts after rank refreshes.';

alter table public.listing_generation_keywords enable row level security;

create policy "listing_generation_keywords_select_member"
  on public.listing_generation_keywords for select
  using (public.is_workspace_member(workspace_id));

create policy "listing_generation_keywords_insert_member"
  on public.listing_generation_keywords for insert
  with check (public.is_workspace_member(workspace_id));

create policy "listing_generation_keywords_delete_member"
  on public.listing_generation_keywords for delete
  using (public.is_workspace_member(workspace_id));
