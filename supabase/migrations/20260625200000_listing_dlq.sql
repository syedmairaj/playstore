-- ============================================================
-- listing_dlq — Dead Letter Queue for failed listing generations
-- ============================================================
-- Rows are written here whenever a generation job:
--   (a) cannot confirm its completion write to workspace_listing_drafts
--       (event: write_unverified), OR
--   (b) completes but produced empty / malformed generated fields
--       (event: malformed_generation).
--
-- The full generation_payload is preserved so an SRE can manually
-- trigger a re-run against the original input.
--
-- Impacts both EN and AR vault environments.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.listing_dlq (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ── Source job ──────────────────────────────────────────────────────────
  job_id             TEXT         NOT NULL,
  workspace_id       TEXT         NOT NULL,
  queue_hash         TEXT         NOT NULL,
  vault_locale       TEXT         NOT NULL DEFAULT 'en',
  step               TEXT         NOT NULL,

  -- ── Failure metadata ─────────────────────────────────────────────────────
  -- failure_event: machine-readable code used by log aggregators and alerting
  -- failure_reason: human-readable string written to the job's error field
  failure_event      TEXT         NOT NULL,
  failure_reason     TEXT         NOT NULL,

  -- ── Captured state ───────────────────────────────────────────────────────
  -- Store the full payload so the job can be manually retried without
  -- having to re-gather all the generation inputs.
  generation_payload JSONB,
  -- Store whatever result was present at DLQ time (may be NULL for
  -- write_unverified failures where no result was ever persisted).
  generation_result  JSONB,

  -- ── Retry tracking ───────────────────────────────────────────────────────
  retry_count        INT          NOT NULL DEFAULT 0,
  retried_at         TIMESTAMPTZ,

  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Ops dashboard: show all DLQ entries for a workspace, newest first
CREATE INDEX IF NOT EXISTS listing_dlq_workspace_created_idx
  ON public.listing_dlq (workspace_id, created_at DESC);

-- Manual retry script: look up entry by the original job id
CREATE INDEX IF NOT EXISTS listing_dlq_job_id_idx
  ON public.listing_dlq (job_id);

-- Filtering by failure event in monitoring queries
CREATE INDEX IF NOT EXISTS listing_dlq_failure_event_idx
  ON public.listing_dlq (failure_event);

-- ── Row Level Security ────────────────────────────────────────────────────────
-- DLQ rows are written exclusively via the Supabase admin / service-role client
-- from the worker.  No authenticated user needs direct access.
ALTER TABLE public.listing_dlq ENABLE ROW LEVEL SECURITY;

-- Allow the service role (admin client) full access
CREATE POLICY "service_role_listing_dlq_all"
  ON public.listing_dlq
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
