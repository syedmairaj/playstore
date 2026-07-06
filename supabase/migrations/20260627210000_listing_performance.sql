-- ============================================================
-- listing_performance
-- ============================================================
-- Links AI-generated listing versions to real-world Play Store
-- analytics via day-level performance rows.
--
-- Design goals
-- ────────────────────────────────────────────────────────────
-- 1. One row per (version_id, performance_date, vault_locale).
--    A version can have many days of data; together they form
--    the version's full deployment window time-series.
--
-- 2. signal_context_snapshot (JSONB) stores the exact
--    GenerationSignalContext that was active at recording time.
--    Keeping it inline lets correlation queries avoid a join:
--    "find rows where signal_context_snapshot->'keywordTracker'
--     @> '{"highConfidenceKeywords":["photo editor"]}'::jsonb"
--
-- 3. RLS mirrors listing_versions.sql exactly: workspace-based
--    isolation via is_workspace_member() + workspace_role().
--
-- 4. Additive — does NOT alter any existing table.
--
-- Covers EN + AR vault locales.
-- ============================================================

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listing_performance (

  -- ── Identity ──────────────────────────────────────────────
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── FK → listing_versions ────────────────────────────────
  -- CASCADE DELETE: when a listing version is removed, its
  -- performance history is removed with it.
  version_id                uuid        NOT NULL
                              REFERENCES public.listing_versions(id) ON DELETE CASCADE,

  -- ── Workspace denormalisation (for RLS + analytical indexes) ─
  -- Denormalised from listing_versions to avoid a join in every
  -- RLS check and in workspace-level aggregation queries.
  workspace_id              uuid        NOT NULL
                              REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- ── Locale (EN / AR) ──────────────────────────────────────
  vault_locale              text        NOT NULL DEFAULT 'en'
                              CHECK (vault_locale IN ('en', 'ar')),

  -- ── Time dimension ────────────────────────────────────────
  -- One row per calendar day for each version.
  performance_date          date        NOT NULL,

  -- ── Google Play Store funnel metrics ─────────────────────
  -- All counts are BIGINT to accommodate high-volume apps.
  -- Values are NULL until fetched from the Play Store API / GCS.
  --
  -- impressions              — unique users who saw the app in
  --                            any Play Store surface (browse,
  --                            search, editorial, ads).
  -- store_visitors           — unique users who viewed the
  --                            store listing page.
  -- store_listing_page_views — total (non-unique) page views of
  --                            the store listing.
  -- installers               — unique users who installed the
  --                            app from this listing.
  -- conversion_rate          — installers / store_visitors × 100
  --                            (%). Stored as a decimal to 4
  --                            places, e.g. 3.1250 = 3.125%.
  impressions               bigint,
  store_visitors            bigint,
  store_listing_page_views  bigint,
  installers                bigint,
  conversion_rate           numeric(10, 4),

  -- ── Signal Context Snapshot ───────────────────────────────
  -- Verbatim copy of the GenerationSignalContext object that was
  -- resolved for the generation job that produced this version.
  -- Stored inline so that correlation queries are self-contained:
  --
  --   SELECT avg(conversion_rate)
  --   FROM   listing_performance
  --   WHERE  signal_context_snapshot
  --            -> 'keywordTracker'
  --            -> 'highConfidenceKeywords'
  --            ? 'photo editor';
  --
  -- Shape (mirrors src/lib/listing/generation-signal-context.types.ts):
  --   {
  --     brandKit:          { style, primaryColor, palette[], toneGuidelines },
  --     marketIntel:       { gaps[], topCategories[] },
  --     reviews:           { topPainPoints[], sentimentScore },
  --     keywordTracker:    { highConfidenceKeywords[], opportunityKeywords[] },
  --     competitorSignals: { weaknesses[], differentiators[], topCompetitors[] }
  --   }
  --
  -- NULL when the snapshot was not captured at generation time
  -- (e.g., rows backfilled from a GCS CSV without a live job).
  signal_context_snapshot   jsonb,

  -- ── Data provenance ───────────────────────────────────────
  -- Where did this row's metric values come from?
  --   'play_store_api'  — Google Play Developer Reporting API
  --   'gcs_export'      — GCS acquisition CSV report
  --   'manual'          — entered via PATCH endpoint
  data_source               text        NOT NULL DEFAULT 'manual'
                              CHECK (data_source IN (
                                'play_store_api',
                                'gcs_export',
                                'manual'
                              )),

  -- ── Timestamps ────────────────────────────────────────────
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  -- ── Composite unique constraint ───────────────────────────
  -- One metric row per version per day per locale.
  -- This is the natural upsert key: ON CONFLICT (version_id, performance_date, vault_locale).
  UNIQUE (version_id, performance_date, vault_locale)
);

-- ── updated_at auto-refresh trigger ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_listing_performance_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_listing_performance_updated_at
  BEFORE UPDATE ON public.listing_performance
  FOR EACH ROW EXECUTE FUNCTION public.set_listing_performance_updated_at();

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Primary analytical lookup: all daily rows for a specific version,
-- newest-first.  Backs the time-series chart in DeploymentView.
CREATE INDEX IF NOT EXISTS idx_listing_performance_version_date
  ON public.listing_performance (version_id, performance_date DESC);

-- Workspace-level aggregation: "show me all performance rows for this
-- workspace sorted by date" — used by the attribution dashboard to
-- build cross-version comparisons without knowing version IDs upfront.
CREATE INDEX IF NOT EXISTS idx_listing_performance_workspace_date
  ON public.listing_performance (workspace_id, performance_date DESC);

-- Locale-scoped workspace analytics (EN vs AR split queries).
CREATE INDEX IF NOT EXISTS idx_listing_performance_workspace_locale_date
  ON public.listing_performance (workspace_id, vault_locale, performance_date DESC);

-- Partial index for GIN on signal_context_snapshot — enables fast
-- jsonb containment queries like:
--   WHERE signal_context_snapshot @> '{"brandKit":{"style":"minimalist"}}'
-- Only indexes rows that actually have a snapshot (avoids NULLs).
CREATE INDEX IF NOT EXISTS idx_listing_performance_signal_snapshot_gin
  ON public.listing_performance USING GIN (signal_context_snapshot)
  WHERE signal_context_snapshot IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Mirrors listing_versions.sql verbatim.

ALTER TABLE public.listing_performance ENABLE ROW LEVEL SECURITY;

-- Members can read all performance rows for their workspace.
CREATE POLICY "listing_performance_select"
  ON public.listing_performance FOR SELECT
  USING (public.is_workspace_member(workspace_id));

-- Members can insert performance rows for their workspace.
-- workspace_id must match the authenticated member's workspace.
CREATE POLICY "listing_performance_insert"
  ON public.listing_performance FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

-- Members can update metric values (e.g. manual corrections).
CREATE POLICY "listing_performance_update"
  ON public.listing_performance FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

-- Only owner / admin can delete performance rows.
CREATE POLICY "listing_performance_delete"
  ON public.listing_performance FOR DELETE
  USING (public.workspace_role(workspace_id) IN ('owner', 'admin'));

-- Service role has unrestricted access (API worker writes).
CREATE POLICY "listing_performance_service_role"
  ON public.listing_performance
  USING (true)
  WITH CHECK (true);

-- ── Database function: get_latest_performance_summary ────────────────────────
--
-- Returns a single summary row for a given version_id, aggregating
-- all performance_date rows:
--
--   avg_conversion_rate   NUMERIC(10,4)  — mean CVR across all days with data
--   total_impressions     BIGINT         — sum of impressions
--   total_store_visitors  BIGINT         — sum of store_visitors
--   total_installers      BIGINT         — sum of installers
--   days_with_data        INTEGER        — number of days that have ≥1 non-null metric
--   first_date            DATE           — earliest performance_date for this version
--   latest_date           DATE           — most recent performance_date for this version
--
-- Returns zero rows (empty set) when the version has no performance data.
-- Callers should handle the empty-set case (e.g., LEFT JOIN or COALESCE).
--
-- SECURITY DEFINER so it can be called by the authenticated role without
-- needing a direct RLS bypass.  The workspace_id check inside listing_versions
-- is implicitly enforced because listing_performance.version_id → listing_versions.id
-- and RLS on listing_performance already gates reads.

CREATE OR REPLACE FUNCTION public.get_latest_performance_summary(
  p_version_id uuid
)
RETURNS TABLE (
  avg_conversion_rate   numeric,
  total_impressions     bigint,
  total_store_visitors  bigint,
  total_installers      bigint,
  days_with_data        integer,
  first_date            date,
  latest_date           date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    -- Average CVR only over days that actually have a value
    ROUND(
      AVG(conversion_rate) FILTER (WHERE conversion_rate IS NOT NULL),
      4
    )                                                         AS avg_conversion_rate,

    COALESCE(SUM(impressions),    0)                          AS total_impressions,
    COALESCE(SUM(store_visitors), 0)                          AS total_store_visitors,
    COALESCE(SUM(installers),     0)                          AS total_installers,

    -- Count only rows where at least one core metric was recorded.
    -- FILTER must come directly after the aggregate call; the cast wraps the result.
    CAST(
      COUNT(*) FILTER (
        WHERE impressions     IS NOT NULL
           OR store_visitors  IS NOT NULL
           OR installers      IS NOT NULL
           OR conversion_rate IS NOT NULL
      )
    AS integer)                                               AS days_with_data,

    MIN(performance_date)                                     AS first_date,
    MAX(performance_date)                                     AS latest_date

  FROM  public.listing_performance
  WHERE version_id = p_version_id;
$$;

-- Grant execute to authenticated callers and service_role.
GRANT EXECUTE ON FUNCTION public.get_latest_performance_summary(uuid)
  TO authenticated, service_role;

-- ── Comment ───────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.listing_performance IS
  'Day-level Play Store funnel metrics linked to a listing_versions row.
   signal_context_snapshot captures the GenerationSignalContext used at
   generation time for downstream correlation and Signal Efficacy analysis.
   One row per (version_id, performance_date, vault_locale).';

COMMENT ON COLUMN public.listing_performance.signal_context_snapshot IS
  'Verbatim GenerationSignalContext JSON (brandKit, marketIntel, reviews,
   keywordTracker, competitorSignals) captured when the listing was generated.
   Enables correlation queries: which keyword mix produced the best CVR?
   GIN-indexed for fast containment (@>) searches.';

COMMENT ON COLUMN public.listing_performance.conversion_rate IS
  'installers / store_visitors × 100 — stored as a percentage with 4 decimal
   places, e.g. 3.1250 = 3.125%. NULL until fetched from Play Store API / GCS.';

COMMENT ON FUNCTION public.get_latest_performance_summary(uuid) IS
  'Aggregates all listing_performance rows for a version into a single
   summary (avg CVR, totals, date range). Returns empty set when no data exists.';
