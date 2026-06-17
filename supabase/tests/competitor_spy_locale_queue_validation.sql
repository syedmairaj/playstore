-- Competitor Spy → optimization_queue locale isolation validation
--
-- Run against a workspace that has staged Competitor Spy items in both EN and AR.
-- Replace :workspace_id and :app_id with real UUIDs before executing.
--
-- Expected:
--   • EN competitor items live only under state_en.features.optimization_queue
--   • AR competitor items live only under state_ar.features.optimization_queue
--   • Optimizer API filters by locale param → items[].language must match branch

-- ── 1. Side-by-side EN vs AR competitor spy queue counts ─────────────────────
WITH vault AS (
  SELECT
    id,
    workspace_id,
    app_id,
    jsonb_array_length(
      COALESCE(state_en -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
    ) AS en_queue_count,
    jsonb_array_length(
      COALESCE(state_ar -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
    ) AS ar_queue_count
  FROM workspace_staging_vault
  WHERE workspace_id = :'workspace_id'
    AND app_id = :'app_id'
    AND COALESCE(is_deleted, false) = false
    AND deleted_at IS NULL
)
SELECT *
FROM vault;

-- ── 2. Extract competitor spy items per locale branch (mirrors readOptimizationQueue) ─
SELECT
  'en' AS vault_branch,
  item ->> 'id' AS item_id,
  item ->> 'type' AS item_type,
  item ->> 'source' AS item_source,
  item ->> 'language' AS item_language,
  item ->> 'content' AS content,
  item -> 'metadata' ->> 'origin_module' AS origin_module,
  item -> 'metadata' ->> 'competitor_id' AS competitor_id
FROM workspace_staging_vault v,
  LATERAL jsonb_array_elements(
    COALESCE(v.state_en -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
  ) AS item
WHERE v.workspace_id = :'workspace_id'
  AND v.app_id = :'app_id'
  AND COALESCE(v.is_deleted, false) = false
  AND v.deleted_at IS NULL
  AND (
    item ->> 'source' = 'competitor_spy'
    OR item -> 'metadata' ->> 'origin_module' = 'competitor_spy'
    OR item ->> 'type' IN ('competitor_keyword', 'competitor_weakness', 'competitor_strength')
  )

UNION ALL

SELECT
  'ar' AS vault_branch,
  item ->> 'id' AS item_id,
  item ->> 'type' AS item_type,
  item ->> 'source' AS item_source,
  item ->> 'language' AS item_language,
  item ->> 'content' AS content,
  item -> 'metadata' ->> 'origin_module' AS origin_module,
  item -> 'metadata' ->> 'competitor_id' AS competitor_id
FROM workspace_staging_vault v,
  LATERAL jsonb_array_elements(
    COALESCE(v.state_ar -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
  ) AS item
WHERE v.workspace_id = :'workspace_id'
  AND v.app_id = :'app_id'
  AND COALESCE(v.is_deleted, false) = false
  AND v.deleted_at IS NULL
  AND (
    item ->> 'source' = 'competitor_spy'
    OR item -> 'metadata' ->> 'origin_module' = 'competitor_spy'
    OR item ->> 'type' IN ('competitor_keyword', 'competitor_weakness', 'competitor_strength')
  )
ORDER BY vault_branch, content;

-- ── 3. Locale integrity assertions (should return zero rows on a healthy vault) ─
--    a) EN branch must not contain items tagged language=ar
SELECT
  'en_branch_has_wrong_language' AS violation,
  item ->> 'id' AS item_id,
  item ->> 'language' AS item_language,
  item ->> 'content' AS content
FROM workspace_staging_vault v,
  LATERAL jsonb_array_elements(
    COALESCE(v.state_en -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
  ) AS item
WHERE v.workspace_id = :'workspace_id'
  AND v.app_id = :'app_id'
  AND item ->> 'language' = 'ar'

UNION ALL

--    b) AR branch must not contain items tagged language=en
SELECT
  'ar_branch_has_wrong_language' AS violation,
  item ->> 'id' AS item_id,
  item ->> 'language' AS item_language,
  item ->> 'content' AS content
FROM workspace_staging_vault v,
  LATERAL jsonb_array_elements(
    COALESCE(v.state_ar -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
  ) AS item
WHERE v.workspace_id = :'workspace_id'
  AND v.app_id = :'app_id'
  AND item ->> 'language' = 'en'

UNION ALL

--    c) Competitor spy items must declare category strength (or competitor_keyword type)
SELECT
  'competitor_spy_wrong_category' AS violation,
  item ->> 'id' AS item_id,
  item ->> 'language' AS item_language,
  item ->> 'category' AS category,
  item ->> 'content' AS content
FROM workspace_staging_vault v,
  LATERAL jsonb_array_elements(
    COALESCE(v.state_en -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
      || COALESCE(v.state_ar -> 'features' -> 'optimization_queue' -> 'items', '[]'::jsonb)
  ) AS item
WHERE v.workspace_id = :'workspace_id'
  AND v.app_id = :'app_id'
  AND item ->> 'source' = 'competitor_spy'
  AND item ->> 'type' IN ('competitor_keyword', 'competitor_weakness', 'competitor_strength')
  AND COALESCE(item ->> 'category', item -> 'metadata' ->> 'category') IS DISTINCT FROM 'strength';
