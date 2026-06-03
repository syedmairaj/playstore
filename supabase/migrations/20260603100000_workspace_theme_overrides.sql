/**
 * Workspace Theme Overrides Table
 * Supports workspace-specific theme customization for premium users
 * Zero impact on base schemas (lib/gemini/schemas.json)
 */

-- Create workspace_theme_overrides table
CREATE TABLE IF NOT EXISTS workspace_theme_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,

  -- Reference to base schema ID
  base_schema_id VARCHAR(50) NOT NULL,

  -- Custom label for this variant
  label VARCHAR(200) NOT NULL,

  -- Color overrides (JSON, all keys optional)
  color_overrides JSONB DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "primaryColor": "#RRGGBB",
  --   "secondaryColor": "#RRGGBB",
  --   "accentColor": "#RRGGBB",
  --   "backgroundColor": "#RRGGBB",
  --   "textColor": "#RRGGBB"
  -- }

  -- Typography overrides (JSON, all keys optional)
  typography_overrides JSONB DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "fontStyle": "clean" | "bold" | "elegant" | "none",
  --   "shadowProfile": "subtle" | "soft" | "dynamic" | "strong" | "refined"
  -- }

  -- RTL-specific adjustments
  rtl_overrides JSONB DEFAULT '{}',
  -- Expected structure:
  -- {
  --   "enabled": true,
  --   "textAlignment": "left" | "right" | "center",
  --   "notes": "Custom RTL behavior description"
  -- }

  -- Whether this override is currently active
  is_active BOOLEAN DEFAULT false,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Constraints
  CONSTRAINT valid_base_schema_id CHECK (
    base_schema_id IN (
      'minimalist-professional',
      'energetic-tech',
      'organic-health',
      'high-contrast-bold',
      'luxury-premium'
    )
  )
);

-- Create indexes for fast lookups
CREATE INDEX idx_workspace_theme_overrides_workspace_id
  ON workspace_theme_overrides(workspace_id);

CREATE INDEX idx_workspace_theme_overrides_workspace_schema
  ON workspace_theme_overrides(workspace_id, base_schema_id);

CREATE INDEX idx_workspace_theme_overrides_active
  ON workspace_theme_overrides(workspace_id, is_active);

-- Partial unique index: Only one active override per (workspace, schema)
-- WHERE clause ensures only active=true rows are enforced as unique
CREATE UNIQUE INDEX idx_unique_active_override_per_workspace_schema
  ON workspace_theme_overrides(workspace_id, base_schema_id)
  WHERE is_active = true;

-- Enable RLS (Row Level Security)
ALTER TABLE workspace_theme_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see overrides for their workspace
CREATE POLICY "Users can view their workspace theme overrides"
  ON workspace_theme_overrides
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Only workspace admins can create overrides
CREATE POLICY "Workspace admins can create theme overrides"
  ON workspace_theme_overrides
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Only workspace admins can update overrides
CREATE POLICY "Workspace admins can update theme overrides"
  ON workspace_theme_overrides
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policy: Only workspace admins can delete overrides
CREATE POLICY "Workspace admins can delete theme overrides"
  ON workspace_theme_overrides
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Trigger: Update updated_at on row change
CREATE OR REPLACE FUNCTION update_workspace_theme_overrides_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspace_theme_overrides_updated_at_trigger
  BEFORE UPDATE ON workspace_theme_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_workspace_theme_overrides_updated_at();

-- Trigger: Ensure only one active override per schema per workspace
CREATE OR REPLACE FUNCTION enforce_single_active_override()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE workspace_theme_overrides
    SET is_active = false
    WHERE workspace_id = NEW.workspace_id
      AND base_schema_id = NEW.base_schema_id
      AND id != NEW.id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_single_active_override_trigger_update
  AFTER UPDATE ON workspace_theme_overrides
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_override();

CREATE TRIGGER enforce_single_active_override_trigger_insert
  AFTER INSERT ON workspace_theme_overrides
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_active_override();

-- Grant appropriate permissions
-- Note: No sequence grant needed since we use UUID, not SERIAL
GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_theme_overrides TO authenticated;

-- Comment for documentation
COMMENT ON TABLE workspace_theme_overrides IS
  'Workspace-specific theme customizations. Premium feature for brand teams to customize ASO themes per workspace. Base schemas in lib/gemini/schemas.json are immutable and version-controlled.';

COMMENT ON COLUMN workspace_theme_overrides.base_schema_id IS
  'Reference to a base schema ID from schemas.json. Used for inheritance and fallback.';

COMMENT ON COLUMN workspace_theme_overrides.color_overrides IS
  'Partial color customizations merged into base schema at load time. All fields optional.';

COMMENT ON COLUMN workspace_theme_overrides.rtl_overrides IS
  'Arabic/Hebrew-specific customizations. Applied during RTL rendering (flop-composite-flop pipeline).';

COMMENT ON COLUMN workspace_theme_overrides.is_active IS
  'Only one override per (workspace, base_schema_id) can be active. Enforced by trigger.';
