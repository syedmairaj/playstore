-- ============================================================
-- Listing Performance Attribution System
-- Two tables:
--   listing_snapshots  — immutable record of every AI generation
--                        (listing copy + signals used + strategy)
--   listing_metrics    — weekly manual metric entries per app
--                        (conversion_rate, store_visitors, rank)
-- Attribution is computed client-side (or via API) by joining
-- the two tables on (workspace_id, app_id) ordered by date.
-- ============================================================

-- ── listing_snapshots ─────────────────────────────────────────
-- One row per successful "Generate Full Listing" click.
-- Captures the exact output AND the signals that drove it so we
-- can attribute metric changes to specific strategy decisions.

create table if not exists public.listing_snapshots (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Workspace + app scoping
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  app_id            uuid        references public.apps(id) on delete set null,
  user_id           uuid        not null references auth.users(id) on delete cascade,

  -- Link back to the source generation row (for full output JSON)
  generation_id     uuid        references public.listing_generations(id) on delete set null,

  -- ── Core listing fields (denormalised for fast display) ──────
  title             text        not null,
  short_description text        not null,
  full_description  text        not null,

  -- ── Signal snapshot (what was in Active Context at click time) ─
  -- Array of signal labels exactly as shown in the UI pills.
  -- Format:
  --   Review issues  → plain label e.g. "Malicious Ads"
  --   Market kws     → "market_spotlight:fitness"
  --   Competitor     → plain weakness label
  signals           text[]      not null default '{}',

  -- Signal type counts for quick filtering / attribution
  review_signal_count    int   not null default 0,
  market_signal_count    int   not null default 0,
  competitor_signal_count int  not null default 0,

  -- ── Strategy meta (from v11 generation output) ───────────────
  strategy_summary  text,          -- "Fixed X + Captured Y + Converted Z"
  aso_score         int,           -- 0–100 self-reported by the model
  prompt_version    text,          -- e.g. "listing-optimizer-v11.0"
  tone_style        text,          -- professional | friendly | bold | minimal
  quality_status    text           -- "maximum" | "partial"
);

create index listing_snapshots_workspace_app_idx
  on public.listing_snapshots (workspace_id, app_id, created_at desc);

create index listing_snapshots_workspace_idx
  on public.listing_snapshots (workspace_id, created_at desc);

-- RLS
alter table public.listing_snapshots enable row level security;

create policy "listing_snapshots_select_member"
  on public.listing_snapshots for select
  to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "listing_snapshots_insert_member"
  on public.listing_snapshots for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id, auth.uid())
    and user_id = auth.uid()
  );

-- Snapshots are immutable — no update/delete policies.

comment on table public.listing_snapshots is
  'Immutable record of every AI listing generation. Captures listing copy + signals used + strategy summary for performance attribution.';


-- ── listing_metrics ───────────────────────────────────────────
-- Weekly manual metric entries. The user enters what they see
-- in Google Play Console (Store Listing → Conversion Rate etc.)
-- once a week. The attribution engine diffs adjacent rows.

create table if not exists public.listing_metrics (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- Workspace + app scoping
  workspace_id      uuid        not null references public.workspaces(id) on delete cascade,
  app_id            uuid        references public.apps(id) on delete set null,
  user_id           uuid        not null references auth.users(id) on delete cascade,

  -- The calendar week this reading covers (Monday of the week, UTC)
  -- Using a week anchor rather than the exact entry date so duplicate
  -- entries for the same week can be detected and the user warned.
  metric_week       date        not null,

  -- ── Core metrics ─────────────────────────────────────────────
  -- All nullable — user may only know some values.

  -- Conversion rate: 0.00–100.00 (percent)
  -- Source: Play Console → Store listing → Conversion optimisation
  conversion_rate   numeric(6,2),

  -- Store listing visitors (absolute number)
  -- Source: Play Console → Store listing → Visitors
  store_visitors    int,

  -- App install rank in the chosen category (lower = better)
  -- Source: Play Console or external ASO tool
  category_rank     int,

  -- Optional search visibility index (0–100) from external tool
  -- (AppTweak, MobileAction, etc.) — may be left null
  search_visibility numeric(5,2),

  -- Free-text note from the user e.g. "ran a price promotion this week"
  -- Used to annotate confounding factors in the attribution card
  note              text,

  -- Unique: one entry per workspace+app+week
  unique (workspace_id, app_id, metric_week)
);

create index listing_metrics_workspace_app_idx
  on public.listing_metrics (workspace_id, app_id, metric_week desc);

-- RLS
alter table public.listing_metrics enable row level security;

create policy "listing_metrics_select_member"
  on public.listing_metrics for select
  to authenticated
  using (public.is_workspace_member(workspace_id, auth.uid()));

create policy "listing_metrics_insert_member"
  on public.listing_metrics for insert
  to authenticated
  with check (
    public.is_workspace_member(workspace_id, auth.uid())
    and user_id = auth.uid()
  );

create policy "listing_metrics_update_owner"
  on public.listing_metrics for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id, auth.uid())
    and user_id = auth.uid()
  )
  with check (
    public.is_workspace_member(workspace_id, auth.uid())
    and user_id = auth.uid()
  );

create policy "listing_metrics_delete_owner"
  on public.listing_metrics for delete
  to authenticated
  using (
    public.is_workspace_member(workspace_id, auth.uid())
    and user_id = auth.uid()
  );

comment on table public.listing_metrics is
  'Weekly manual metric entries (conversion rate, store visitors, rank) for listing performance attribution.';

comment on column public.listing_metrics.metric_week is
  'ISO Monday of the week this reading covers (UTC). One entry per app per week enforced by unique constraint.';

comment on column public.listing_metrics.conversion_rate is
  'Store listing conversion rate as a percentage (0–100). Source: Google Play Console → Store listing → Conversion optimisation.';

comment on column public.listing_metrics.store_visitors is
  'Store listing visitor count for the week. Source: Play Console → Store listing → Visitors.';

comment on column public.listing_metrics.category_rank is
  'Category chart rank (lower is better). Source: Play Console or external ASO tool.';

comment on column public.listing_metrics.search_visibility is
  'Search visibility index 0–100 from external tool (AppTweak etc.). Optional.';
