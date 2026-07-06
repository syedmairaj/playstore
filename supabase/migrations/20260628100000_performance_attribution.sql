-- ============================================================
-- Performance Attribution — two-table model
--
-- 1. listing_version_signal_snapshots
--    Captures the GenerationSignalContext used at the time a
--    listing version was generated.  Keyed by job_id so the
--    link is preserved even when the draft row is later cleaned.
--
-- 2. listing_version_metrics
--    Stores daily Play Store performance metrics (impressions,
--    store visits, installers, CVR, CTR) per listing version.
--    Data is fetched from the Google Play Developer API / GCS
--    acquisition reports and cached here to avoid repeated calls.
--
-- Both tables cover EN + AR vault locales.
-- ============================================================

-- ── 1. Signal Snapshots ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listing_version_signal_snapshots (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to the generated listing version (may be null for very old jobs
  -- that pre-date the versioning system).
  version_id          uuid        REFERENCES public.listing_versions(id) ON DELETE SET NULL,
  -- The async job that produced this version.  Never null — this is the
  -- primary correlation key between generation and performance.
  job_id              text        NOT NULL,
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  vault_locale        text        NOT NULL DEFAULT 'en'
                        CHECK (vault_locale IN ('en', 'ar')),

  -- ── Signal snapshots (JSONB) ────────────────────────────────
  -- Verbatim copy of each GenerationSignalContext dimension,
  -- captured at the moment runListingGenerationOrchestrator ran.
  brand_kit           jsonb       NOT NULL DEFAULT '{}',
  market_intel        jsonb       NOT NULL DEFAULT '{}',
  reviews             jsonb       NOT NULL DEFAULT '{}',
  keyword_tracker     jsonb       NOT NULL DEFAULT '{}',
  competitor_signals  jsonb       NOT NULL DEFAULT '{}',

  -- ── Derived signal counts (for efficient Signal Efficacy queries) ──
  signal_count        integer     NOT NULL DEFAULT 0,  -- total signals across all dimensions
  keywords_count      integer     NOT NULL DEFAULT 0,
  competitors_count   integer     NOT NULL DEFAULT 0,
  review_pains_count  integer     NOT NULL DEFAULT 0,
  market_gaps_count   integer     NOT NULL DEFAULT 0,
  has_brand_kit       boolean     NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now(),

  -- One snapshot per job (idempotent re-saves overwrite gracefully via upsert)
  UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_lv_signal_snapshots_workspace
  ON public.listing_version_signal_snapshots (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lv_signal_snapshots_version
  ON public.listing_version_signal_snapshots (version_id)
  WHERE version_id IS NOT NULL;

-- ── 2. Listing Version Metrics ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.listing_version_metrics (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id          uuid        NOT NULL REFERENCES public.listing_versions(id) ON DELETE CASCADE,
  workspace_id        uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  app_id              uuid        REFERENCES public.apps(id) ON DELETE SET NULL,
  package_name        text        NOT NULL,
  vault_locale        text        NOT NULL DEFAULT 'en'
                        CHECK (vault_locale IN ('en', 'ar')),

  -- ── Measurement window ───────────────────────────────────────
  -- One row per (version_id, metric_date, vault_locale).
  -- Multiple rows per version — one per day of the deployment.
  metric_date         date        NOT NULL,

  -- ── Play Store funnel metrics ────────────────────────────────
  -- All values are nullable — they stay null until fetched from
  -- the Google Play Developer API / GCS.
  store_visits        integer,     -- unique users who viewed the store listing
  installers          integer,     -- unique users who installed
  impressions         integer,     -- unique users who saw the app anywhere in Play Store
  -- Conversion Rate (installers / store_visits × 100)
  conversion_rate     numeric(8, 4),
  -- Store Listing Conversion Rate from Google Play's canonical definition
  store_listing_cvr   numeric(8, 4),
  -- Click-Through Rate (store visits / impressions × 100)
  ctr                 numeric(8, 4),

  -- ── Data provenance ──────────────────────────────────────────
  -- 'play_store_api'  — Google Play Developer Reporting API
  -- 'gcs_export'      — GCS acquisition CSV export
  -- 'manual'          — User-entered via PATCH endpoint
  source              text        NOT NULL DEFAULT 'manual'
                        CHECK (source IN ('play_store_api', 'gcs_export', 'manual')),
  fetched_at          timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (version_id, metric_date, vault_locale)
);

CREATE INDEX IF NOT EXISTS idx_lv_metrics_workspace_version
  ON public.listing_version_metrics (workspace_id, version_id, metric_date DESC);

CREATE INDEX IF NOT EXISTS idx_lv_metrics_package_date
  ON public.listing_version_metrics (package_name, metric_date DESC);

-- ── RLS for both tables ───────────────────────────────────────

ALTER TABLE public.listing_version_signal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lv_signal_snapshots_select"
  ON public.listing_version_signal_snapshots FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "lv_signal_snapshots_insert"
  ON public.listing_version_signal_snapshots FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "lv_signal_snapshots_service_role"
  ON public.listing_version_signal_snapshots
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.listing_version_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lv_metrics_select"
  ON public.listing_version_metrics FOR SELECT
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "lv_metrics_insert"
  ON public.listing_version_metrics FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id));

CREATE POLICY "lv_metrics_update"
  ON public.listing_version_metrics FOR UPDATE
  USING (public.is_workspace_member(workspace_id));

CREATE POLICY "lv_metrics_service_role"
  ON public.listing_version_metrics
  USING (true)
  WITH CHECK (true);
