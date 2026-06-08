/**
 * MIGRATION: Create Compound Unique Index for Competitor Data Isolation
 *
 * PURPOSE:
 * Enforce strict data isolation when storing competitor_weakness signals.
 * Guarantees that each competitor has exactly ONE current signal per language per workspace,
 * preventing data collision when users switch between competitors.
 *
 * ISOLATION DIMENSIONS:
 * 1. workspace_id: Which workspace owns this signal
 * 2. competitor_id: Which competitor this signal represents (from metadata)
 * 3. language: Which language (en/ar) this signal is in
 * 4. signal_type: Type of signal (competitor_weakness, exploit_data, etc.)
 *
 * BENEFIT:
 * - User switches Competitor A → B: Old A data is automatically isolated
 * - New competitor data arrives: Upserts cleanly without duplicates
 * - Query performance: O(1) lookup even with millions of signals
 *
 * DEPLOYMENT:
 * 1. Run this migration in Supabase SQL Editor
 * 2. Verify index creation: SELECT * FROM pg_indexes WHERE tablename = 'workspace_staging_vault'
 * 3. Monitor query performance: Should see <5ms response times
 */

-- Create the compound unique index for competitor signal isolation
CREATE UNIQUE INDEX IF NOT EXISTS idx_competitor_signal_isolation
  ON workspace_staging_vault (
    workspace_id,
    (metadata->>'competitor_id'),  -- Extract competitor_id from JSONB metadata
    language,
    signal_type
  )
  WHERE signal_type = 'competitor_weakness';  -- Only apply to competitor signals


-- Documentation comment for future reference
COMMENT ON INDEX idx_competitor_signal_isolation IS
'Enforces competitor signal isolation: (workspace_id, metadata.competitor_id, language, signal_type).
Guarantees each competitor has exactly ONE signal per language, preventing data collision.
Enables fast O(1) lookup when users switch between competitors.';
