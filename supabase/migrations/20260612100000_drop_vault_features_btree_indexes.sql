-- Drop btree expression indexes on state_en/state_ar -> 'features'.
--
-- These indexes hit PostgreSQL's btree row-size limit (~2704 bytes) when the
-- features JSONB grows (optimization queue, competitor_spy, etc.).
-- GIN indexes on state_en / state_ar (idx_vault_state_en, idx_vault_state_ar)
-- remain and support JSONB containment queries.

DROP INDEX IF EXISTS idx_vault_state_en_features;
DROP INDEX IF EXISTS idx_vault_state_ar_features;
