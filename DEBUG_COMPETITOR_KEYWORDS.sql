-- DEBUG: Competitor Keywords Data Audit
-- Run these queries in Supabase SQL Editor to diagnose issues

-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 1: Check all competitor_weakness signals exist
-- ════════════════════════════════════════════════════════════════════════════
-- Shows: competitor_id, language, keyword counts
SELECT
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  signal_type,
  jsonb_array_length(metadata->'keywords_by_strategy'->'high_volume') as high_volume_count,
  jsonb_array_length(metadata->'keywords_by_strategy'->'intent_based') as intent_based_count,
  jsonb_array_length(metadata->'keywords_by_strategy'->'competitor_gap') as competitor_gap_count,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
ORDER BY created_at DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 2: Check for specific competitor (e.g., com.strava)
-- ════════════════════════════════════════════════════════════════════════════
-- Replace 'com.strava' with your actual competitor ID
SELECT
  id,
  workspace_id,
  metadata,
  language,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
  AND metadata->>'competitor_id' = 'com.strava'
ORDER BY created_at DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 3: Check isolation - competitor A should NOT have competitor B's data
-- ════════════════════════════════════════════════════════════════════════════
-- Shows: All competitors with their keyword counts (should be different)
SELECT
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  jsonb_array_length(metadata->'keywords_by_strategy'->'high_volume') +
  jsonb_array_length(metadata->'keywords_by_strategy'->'intent_based') +
  jsonb_array_length(metadata->'keywords_by_strategy'->'competitor_gap') as total_keywords
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
GROUP BY competitor_id, competitor_name, language
ORDER BY competitor_id, language;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 4: Validate metadata JSON structure
-- ════════════════════════════════════════════════════════════════════════════
-- Shows: Any signals with malformed metadata
SELECT
  id,
  workspace_id,
  metadata->>'competitor_id' as competitor_id,
  language,
  (metadata ? 'competitor_id') as has_competitor_id,
  (metadata ? 'competitor_name') as has_competitor_name,
  (metadata ? 'keywords_by_strategy') as has_keywords_by_strategy,
  (metadata ? 'vulnerabilities') as has_vulnerabilities,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
ORDER BY created_at DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 5: Extract sample keywords from competitor (for verification)
-- ════════════════════════════════════════════════════════════════════════════
-- Replace 'com.strava' and 'en' with actual values
SELECT
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  metadata->'keywords_by_strategy'->'high_volume' as high_volume_keywords,
  metadata->'keywords_by_strategy'->'intent_based' as intent_based_keywords,
  metadata->'keywords_by_strategy'->'competitor_gap' as competitor_gap_keywords
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
  AND metadata->>'competitor_id' = 'com.strava'
  AND language = 'en'
LIMIT 1;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 6: Check uniqueness constraint (should have at most 1 per competitor+language)
-- ════════════════════════════════════════════════════════════════════════════
-- If this returns counts > 1, you have duplicates
SELECT
  metadata->>'competitor_id' as competitor_id,
  language,
  COUNT(*) as signal_count
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY 1, 2;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 7: Verify index exists and is being used
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'workspace_staging_vault'
  AND indexname = 'idx_competitor_signal_isolation';


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 8: Check for NULL values in critical metadata fields
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  id,
  metadata->>'competitor_id' as competitor_id,
  metadata->>'competitor_name' as competitor_name,
  language,
  (metadata ? 'keywords_by_strategy') as has_keywords_by_strategy
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
  AND (metadata->>'competitor_id' IS NULL
    OR metadata->>'competitor_name' IS NULL
    OR NOT (metadata ? 'keywords_by_strategy'))
ORDER BY created_at DESC;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 9: Get exact structure of one signal (for debugging)
-- ════════════════════════════════════════════════════════════════════════════
-- Replace workspace_id with actual ID
SELECT
  id,
  jsonb_pretty(metadata) as formatted_metadata,
  language,
  created_at
FROM workspace_staging_vault
WHERE signal_type = 'competitor_weakness'
  AND workspace_id = 'YOUR_WORKSPACE_ID'
LIMIT 1;


-- ════════════════════════════════════════════════════════════════════════════
-- QUERY 10: Performance check - are queries using the index?
-- ════════════════════════════════════════════════════════════════════════════
-- Explain query plan for typical retrieval
EXPLAIN ANALYZE
SELECT metadata, content, created_at
FROM workspace_staging_vault
WHERE workspace_id = 'YOUR_WORKSPACE_ID'
  AND signal_type = 'competitor_weakness'
  AND language = 'en'
  AND metadata->>'competitor_id' = 'com.strava'
ORDER BY created_at DESC
LIMIT 1;
