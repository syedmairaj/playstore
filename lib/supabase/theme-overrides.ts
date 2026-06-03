/**
 * Database helpers for workspace theme overrides
 *
 * Provides functions to load, create, and manage workspace-specific theme customizations.
 * Integrates with load-theme.ts to merge overrides into base schemas.
 */

import { createClient } from "@supabase/supabase-js";
import type {
  WorkspaceThemeOverride,
  MoodSchemaType,
} from "@/lib/gemini/mood-schema-types";

/**
 * Get Supabase admin client
 * Used server-side to access workspace_theme_overrides with RLS
 */
function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Load active theme override for a workspace and schema
 *
 * @param workspaceId - Workspace ID
 * @param schemaId - Base schema ID
 * @returns Active override or null if none exists
 *
 * @example
 * ```typescript
 * const override = await loadWorkspaceThemeOverride(
 *   "workspace123",
 *   "minimalist-professional"
 * );
 *
 * const theme = await loadThemeForWorkspace(
 *   workspaceId,
 *   schemaId,
 *   override
 * );
 * ```
 */
export async function loadWorkspaceThemeOverride(
  workspaceId: string,
  schemaId: MoodSchemaType
): Promise<WorkspaceThemeOverride | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("base_schema_id", schemaId)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      console.error("Failed to load theme override:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Transform database row to WorkspaceThemeOverride
    return {
      id: data.id,
      workspaceId: data.workspace_id,
      baseSchemaId: data.base_schema_id as MoodSchemaType,
      label: data.label,
      colorOverrides: data.color_overrides || {},
      typographyOverrides: data.typography_overrides || {},
      rtlOverrides: data.rtl_overrides || {},
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("Error loading workspace theme override:", error);
    return null;
  }
}

/**
 * Load all overrides for a workspace
 *
 * @param workspaceId - Workspace ID
 * @returns Array of all overrides (active and inactive)
 */
export async function loadWorkspaceThemeOverrides(
  workspaceId: string
): Promise<WorkspaceThemeOverride[]> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load theme overrides:", error);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      baseSchemaId: row.base_schema_id as MoodSchemaType,
      label: row.label,
      colorOverrides: row.color_overrides || {},
      typographyOverrides: row.typography_overrides || {},
      rtlOverrides: row.rtl_overrides || {},
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error("Error loading workspace theme overrides:", error);
    return [];
  }
}

/**
 * Create a new workspace theme override
 *
 * @param workspaceId - Workspace ID
 * @param baseSchemaId - Base schema to customize
 * @param label - Display name for this override
 * @param createdByUserId - User ID who created this
 * @param colorOverrides - Optional color customizations
 * @param typographyOverrides - Optional typography customizations
 * @param rtlOverrides - Optional RTL customizations
 * @returns Created override or null on error
 */
export async function createWorkspaceThemeOverride(
  workspaceId: string,
  baseSchemaId: MoodSchemaType,
  label: string,
  createdByUserId: string,
  colorOverrides?: Record<string, string>,
  typographyOverrides?: Record<string, string>,
  rtlOverrides?: Record<string, unknown>
): Promise<WorkspaceThemeOverride | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .insert({
        workspace_id: workspaceId,
        base_schema_id: baseSchemaId,
        label,
        color_overrides: colorOverrides || {},
        typography_overrides: typographyOverrides || {},
        rtl_overrides: rtlOverrides || {},
        is_active: false,
        created_by: createdByUserId,
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create theme override:", error);
      return null;
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      baseSchemaId: data.base_schema_id as MoodSchemaType,
      label: data.label,
      colorOverrides: data.color_overrides || {},
      typographyOverrides: data.typography_overrides || {},
      rtlOverrides: data.rtl_overrides || {},
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("Error creating theme override:", error);
    return null;
  }
}

/**
 * Update an existing workspace theme override
 *
 * @param overrideId - Override ID to update
 * @param updates - Partial updates
 * @returns Updated override or null on error
 */
export async function updateWorkspaceThemeOverride(
  overrideId: string,
  updates: {
    label?: string;
    colorOverrides?: Record<string, string>;
    typographyOverrides?: Record<string, string>;
    rtlOverrides?: Record<string, unknown>;
  }
): Promise<WorkspaceThemeOverride | null> {
  try {
    const client = getAdminClient();

    const updatePayload: Record<string, unknown> = {};

    if (updates.label !== undefined) updatePayload.label = updates.label;
    if (updates.colorOverrides !== undefined)
      updatePayload.color_overrides = updates.colorOverrides;
    if (updates.typographyOverrides !== undefined)
      updatePayload.typography_overrides = updates.typographyOverrides;
    if (updates.rtlOverrides !== undefined)
      updatePayload.rtl_overrides = updates.rtlOverrides;

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .update(updatePayload)
      .eq("id", overrideId)
      .select()
      .single();

    if (error) {
      console.error("Failed to update theme override:", error);
      return null;
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      baseSchemaId: data.base_schema_id as MoodSchemaType,
      label: data.label,
      colorOverrides: data.color_overrides || {},
      typographyOverrides: data.typography_overrides || {},
      rtlOverrides: data.rtl_overrides || {},
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("Error updating theme override:", error);
    return null;
  }
}

/**
 * Activate a workspace theme override
 * Deactivates any other override for the same schema
 *
 * @param overrideId - Override ID to activate
 * @returns Updated override or null on error
 */
export async function activateWorkspaceThemeOverride(
  overrideId: string
): Promise<WorkspaceThemeOverride | null> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .update({ is_active: true })
      .eq("id", overrideId)
      .select()
      .single();

    if (error) {
      console.error("Failed to activate theme override:", error);
      return null;
    }

    return {
      id: data.id,
      workspaceId: data.workspace_id,
      baseSchemaId: data.base_schema_id as MoodSchemaType,
      label: data.label,
      colorOverrides: data.color_overrides || {},
      typographyOverrides: data.typography_overrides || {},
      rtlOverrides: data.rtl_overrides || {},
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (error) {
    console.error("Error activating theme override:", error);
    return null;
  }
}

/**
 * Delete a workspace theme override
 *
 * @param overrideId - Override ID to delete
 * @returns true if deleted, false on error
 */
export async function deleteWorkspaceThemeOverride(
  overrideId: string
): Promise<boolean> {
  try {
    const client = getAdminClient();

    const { error } = await client
      .from("workspace_theme_overrides")
      .delete()
      .eq("id", overrideId);

    if (error) {
      console.error("Failed to delete theme override:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error deleting theme override:", error);
    return false;
  }
}

/**
 * Check if a workspace has any active overrides
 *
 * @param workspaceId - Workspace ID
 * @returns true if workspace has active overrides
 */
export async function hasActiveThemeOverrides(
  workspaceId: string
): Promise<boolean> {
  try {
    const client = getAdminClient();

    const { data, error } = await client
      .from("workspace_theme_overrides")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows found
      console.error("Failed to check active overrides:", error);
      return false;
    }

    return !!data;
  } catch (error) {
    console.error("Error checking active overrides:", error);
    return false;
  }
}
