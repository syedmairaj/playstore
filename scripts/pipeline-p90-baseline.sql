-- ══════════════════════════════════════════════════════════════════════════════
-- Pipeline P90 Performance Baseline
-- Purpose : Calculate P50 / P90 / P99 end-to-end pipeline latency
--           (QUEUED → COMPLETED) and per-phase cost baselines.
-- Tables  : workspace_listing_drafts  (only has updated_at — no created_at)
--           listing_generation_costs  (has created_at per phase)
-- Usage   : Run in Supabase SQL Editor, psql, or as a scheduled pg_cron job.
--
-- Column note:
--   workspace_listing_drafts does NOT have a created_at column (the table
--   pre-dates the column and CREATE TABLE IF NOT EXISTS never added it).
--   All recency filters on that table use updated_at.
--   listing_generation_costs DOES have created_at and is used as the
--   "generation start" timestamp for duration calculations.
-- ══════════════════════════════════════════════════════════════════════════════


-- ──────────────────────────────────────────────────────────────────────────────
-- 1a. PIPELINE DURATION (end-to-end): FIRST-PHASE-COST → COMPLETED
--
-- "Start" = earliest listing_generation_costs.created_at for the queue_hash
--           (the moment the worker began the first Gemini phase).
-- "End"   = workspace_listing_drafts.updated_at when status = 'completed'
--           (the moment the worker wrote the final result).
--
-- Rolling 30 days, grouped by EN / AR vault locale.
-- ──────────────────────────────────────────────────────────────────────────────

WITH phase_starts AS (
  -- Earliest cost record per queue_hash = worker "kick-off" timestamp
  SELECT
    queue_hash,
    MIN(created_at) AS first_phase_at
  FROM public.listing_generation_costs
  WHERE created_at >= now() - INTERVAL '30 days'
  GROUP BY queue_hash
),
completed_jobs AS (
  SELECT
    d.id,
    d.workspace_id,
    d.vault_locale,
    d.queue_hash,
    ps.first_phase_at                                            AS queued_at,
    d.updated_at                                                 AS completed_at,
    EXTRACT(EPOCH FROM (d.updated_at - ps.first_phase_at))       AS duration_seconds
  FROM public.workspace_listing_drafts d
  JOIN phase_starts ps USING (queue_hash)
  WHERE d.generation_status = 'completed'
    AND d.updated_at >= now() - INTERVAL '30 days'
    AND d.updated_at > ps.first_phase_at    -- exclude clock-skew noise
)
SELECT
  vault_locale,
  COUNT(*)                                                                       AS completed_jobs,
  ROUND(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_seconds)::numeric, 1) AS p50_seconds,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY duration_seconds)::numeric, 1) AS p90_seconds,
  ROUND(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_seconds)::numeric, 1) AS p99_seconds,
  ROUND(AVG(duration_seconds)::numeric, 1)                                       AS avg_seconds,
  ROUND(MIN(duration_seconds)::numeric, 1)                                       AS min_seconds,
  ROUND(MAX(duration_seconds)::numeric, 1)                                       AS max_seconds
FROM completed_jobs
GROUP BY vault_locale
ORDER BY vault_locale;


-- ──────────────────────────────────────────────────────────────────────────────
-- 1b. Weekly P90 trend (last 12 weeks) — track over time
-- week_start is bucketed from the first phase cost timestamp (reliable created_at).
-- Paste into a cron-scheduled query and write results to an analytics table
-- or export to a monitoring dashboard.
-- ──────────────────────────────────────────────────────────────────────────────

WITH phase_starts AS (
  SELECT
    queue_hash,
    MIN(created_at) AS first_phase_at
  FROM public.listing_generation_costs
  WHERE created_at >= now() - INTERVAL '12 weeks'
  GROUP BY queue_hash
),
weekly_buckets AS (
  SELECT
    date_trunc('week', ps.first_phase_at)                           AS week_start,
    d.vault_locale,
    EXTRACT(EPOCH FROM (d.updated_at - ps.first_phase_at))          AS duration_seconds
  FROM public.workspace_listing_drafts d
  JOIN phase_starts ps USING (queue_hash)
  WHERE d.generation_status = 'completed'
    AND d.updated_at >= now() - INTERVAL '12 weeks'
    AND d.updated_at > ps.first_phase_at
)
SELECT
  week_start,
  vault_locale,
  COUNT(*)                                                                       AS jobs,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY duration_seconds)::numeric, 1) AS p90_seconds
FROM weekly_buckets
GROUP BY week_start, vault_locale
ORDER BY week_start DESC, vault_locale;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. PER-PHASE COST BASELINE (tokens + credits, rolling 30 days)
-- listing_generation_costs.created_at exists — no change needed here.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  generation_step                                                      AS phase,
  COUNT(*)                                                             AS runs,
  ROUND(AVG(credits_charged)::numeric, 4)                             AS avg_credits,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY credits_charged)::numeric, 4) AS p90_credits,
  ROUND(AVG(prompt_tokens)::numeric, 0)                               AS avg_prompt_tokens,
  ROUND(AVG(completion_tokens)::numeric, 0)                           AS avg_completion_tokens,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY prompt_tokens)::numeric, 0)     AS p90_prompt_tokens,
  ROUND(percentile_cont(0.90) WITHIN GROUP (ORDER BY completion_tokens)::numeric, 0) AS p90_completion_tokens,
  ROUND(SUM(credits_charged)::numeric, 2)                             AS total_credits_30d
FROM public.listing_generation_costs
WHERE created_at >= now() - INTERVAL '30 days'
GROUP BY generation_step
ORDER BY
  CASE generation_step
    WHEN 'title'    THEN 1
    WHEN 'short'    THEN 2
    WHEN 'long'     THEN 3
    WHEN 'full'     THEN 4
    ELSE 5
  END;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. JOB HEALTH SNAPSHOT — status distribution (rolling 7 days)
-- Filters on updated_at (workspace_listing_drafts has no created_at).
-- Use this daily to detect sudden spikes in failed or stuck jobs.
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  vault_locale,
  generation_status                                                     AS status,
  COUNT(*)                                                              AS count,
  ROUND(
    100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY vault_locale), 0),
    1
  )                                                                      AS pct_of_locale
FROM public.workspace_listing_drafts
WHERE updated_at >= now() - INTERVAL '7 days'
  AND generation_status IS NOT NULL
GROUP BY vault_locale, generation_status
ORDER BY vault_locale, status;


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. STALE_VAULT_CONTEXT RATE — proxy via failed jobs with stale error text
-- Filters on updated_at (workspace_listing_drafts has no created_at).
-- High rates indicate users mutating the queue mid-generation; consider
-- alerting when this exceeds 5% of total failed jobs over 24 hours.
-- ──────────────────────────────────────────────────────────────────────────────

WITH recent_failures AS (
  SELECT
    generation_error,
    vault_locale,
    updated_at
  FROM public.workspace_listing_drafts
  WHERE generation_status = 'failed'
    AND updated_at >= now() - INTERVAL '24 hours'
),
classified AS (
  SELECT
    vault_locale,
    CASE
      WHEN generation_error ILIKE '%stale%' OR generation_error ILIKE '%vault%context%'
        THEN 'stale_vault_context'
      ELSE 'other_failure'
    END AS failure_type,
    COUNT(*) AS cnt
  FROM recent_failures
  GROUP BY vault_locale, failure_type
)
SELECT
  vault_locale,
  failure_type,
  cnt,
  ROUND(100.0 * cnt / NULLIF(SUM(cnt) OVER (PARTITION BY vault_locale), 0), 1) AS pct
FROM classified
ORDER BY vault_locale, failure_type;


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. ZOMBIE JOB DETECTION — equivalent of detect-zombie-jobs.mjs in pure SQL
-- Timeout is read from ops_config via public.zombie_job_timeout_minutes() so
-- this query automatically reflects any change made to that table row — no
-- manual interval edits needed.  Run in a pg_cron job every 15 minutes;
-- alert when count > 0.
--
-- To update the threshold without a new migration:
--   UPDATE public.ops_config
--   SET    value = '60'
--   WHERE  key   = 'zombie_job_timeout_minutes';
-- ──────────────────────────────────────────────────────────────────────────────

SELECT
  id,
  workspace_id,
  vault_locale,
  job_id,
  generation_status,
  updated_at,
  EXTRACT(EPOCH FROM (now() - updated_at)) / 60                AS stale_minutes,
  public.zombie_job_timeout_minutes()                          AS configured_timeout_minutes,
  LEFT(generation_error, 120)                                  AS last_error
FROM public.workspace_listing_drafts
WHERE generation_status IN ('pending', 'processing')
  AND updated_at < now() - (public.zombie_job_timeout_minutes() || ' minutes')::interval
ORDER BY updated_at ASC
LIMIT 100;
