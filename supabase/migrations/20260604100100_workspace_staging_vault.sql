/**
 * Workspace Staging Vault
 *
 * Persistent storage for staged signals (keywords, review issues, competitor insights)
 * Replaces transient 'Send to Optimizer' navigation pattern
 *
 * Features:
 * - Multi-signal type support (keyword, review_issue, competitor_weakness)
 * - Full LTR/RTL parity (Arabic/Hebrew content preserved exactly)
 * - Timestamp tracking (created_at, expires_at for optional TTL)
 * - Source attribution (which page/feature queued the signal)
 * - Soft delete support (deleted_at, not hard delete)
 * - RLS policies for workspace isolation
 */

-- Create enum for signal types
CREATE TYPE signal_type AS ENUM (
  'keyword',              -- From Market Intelligence / Keyword Tracker
  'review_issue',         -- From Reviews & Common Issues
  'competitor_weakness',  -- From Competitive Intelligence / Spy
  'optimization_insight'  -- From other optimization sources
);

-- Create enum for signal sources (which page/feature created it)
CREATE TYPE signal_source AS ENUM (
  'keyword_spotlight',    -- Market Intelligence
  'keyword_tracker',      -- Keyword Tracker
  'review_analysis',      -- Reviews & Common Issues
  'competitor_spy',       -- Competitive Intelligence
  'manual',               -- User manually added
  'api'                   -- External API
);

-- Main staging vault table
CREATE TABLE workspace_staging_vault (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Signal content
  signal_type signal_type NOT NULL,
  source signal_source NOT NULL DEFAULT 'manual',
  content text NOT NULL,                          -- UTF-8 preserved (Arabic/English/etc)
  metadata jsonb DEFAULT '{}'::jsonb,            -- Additional context (category, language, etc)

  -- Localization
  language text DEFAULT 'en',                    -- 'en', 'ar', 'he', etc
  is_rtl boolean DEFAULT false,                  -- RTL detection (set on insert based on language)

  -- Source attribution
  source_app_id uuid,                            -- Which app this signal is for
  source_context text,                           -- 'review_id', 'competitor_id', 'keyword_id', etc
  source_context_id text,                        -- The actual ID value

  -- Lifecycle
  created_at timestamptz DEFAULT now(),
  created_by_user_id uuid REFERENCES auth.users(id),

  -- TTL support (optional, can be NULL for permanent signals)
  expires_at timestamptz,                        -- Auto-delete after this date (if implemented)

  -- Soft delete
  deleted_at timestamptz,                        -- NULL = active, set to delete
  deleted_by_user_id uuid REFERENCES auth.users(id),

  -- Constraints
  CONSTRAINT valid_content CHECK (length(content) > 0 AND length(content) <= 5000),
  CONSTRAINT valid_language CHECK (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT not_both_deleted_and_deleted_by CHECK (
    (deleted_at IS NULL AND deleted_by_user_id IS NULL) OR
    (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL)
  )
);

-- Indexes for common queries
CREATE INDEX idx_staging_vault_workspace ON workspace_staging_vault(workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_staging_vault_workspace_type ON workspace_staging_vault(workspace_id, signal_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_staging_vault_workspace_app ON workspace_staging_vault(workspace_id, source_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_staging_vault_created ON workspace_staging_vault(workspace_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_staging_vault_expires ON workspace_staging_vault(expires_at)
  WHERE deleted_at IS NULL AND expires_at IS NOT NULL;

-- Full-text search index for content
CREATE INDEX idx_staging_vault_content_gin ON workspace_staging_vault
  USING gin(to_tsvector('simple', content))
  WHERE deleted_at IS NULL;

-- RLS Policies
ALTER TABLE workspace_staging_vault ENABLE ROW LEVEL SECURITY;

-- SELECT: Users can view signals in their workspace
CREATE POLICY staging_vault_select ON workspace_staging_vault FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- INSERT: Users can add signals to their workspace
CREATE POLICY staging_vault_insert ON workspace_staging_vault FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- UPDATE: Users can only update non-critical fields (metadata, expires_at)
CREATE POLICY staging_vault_update ON workspace_staging_vault FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Can only update metadata and expires_at, not content/type/source
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- DELETE (soft): Users can soft-delete their own signals
CREATE POLICY staging_vault_delete ON workspace_staging_vault FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    ) AND created_by_user_id = auth.uid()
  );

-- Grant basic permissions
GRANT SELECT, INSERT ON workspace_staging_vault TO authenticated;
GRANT UPDATE(metadata, expires_at) ON workspace_staging_vault TO authenticated;
GRANT DELETE ON workspace_staging_vault TO authenticated;

-- Auto-detect RTL based on language
CREATE OR REPLACE FUNCTION set_staging_vault_rtl()
RETURNS TRIGGER AS $$
BEGIN
  -- Set is_rtl based on language code
  NEW.is_rtl := NEW.language IN ('ar', 'he', 'fa', 'ur');

  -- Auto-set created_by_user_id if null
  IF NEW.created_by_user_id IS NULL THEN
    NEW.created_by_user_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER staging_vault_rtl_trigger
BEFORE INSERT ON workspace_staging_vault
FOR EACH ROW
EXECUTE FUNCTION set_staging_vault_rtl();

-- Comment on table for documentation
COMMENT ON TABLE workspace_staging_vault IS
'Persistent staging vault for workspace signals (keywords, issues, insights).
Replaces transient navigation pattern. Supports RTL/LTR, TTL, soft-delete.';

COMMENT ON COLUMN workspace_staging_vault.content IS
'Signal content (keyword phrase, issue description, insight text).
UTF-8 fully preserved - Arabic, Hebrew, emoji all supported exactly as entered.';

COMMENT ON COLUMN workspace_staging_vault.is_rtl IS
'Right-to-left flag. Auto-set based on language code (ar, he, fa, ur = true).
Used for UI rendering and text direction handling.';

COMMENT ON COLUMN workspace_staging_vault.metadata IS
'JSON context: {category, sourceKeyword, competitorName, reviewScore, etc}.
Used by Brand Mirror Engine and Consultant Layer for generation context.';
