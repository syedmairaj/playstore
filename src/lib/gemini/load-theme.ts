/**
 * Theme Loader with Workspace Overrides
 *
 * Loads themes from schemas.json and merges with workspace-specific customizations.
 * Zero impact on compositing engine (compose-screenshot.ts) — schema is opaque to it.
 *
 * Usage:
 * ```typescript
 * const theme = await loadThemeForWorkspace(workspaceId, "minimalist-professional");
 * const layout = {
 *   primaryColor: theme.schema.primaryColor,
 *   textColor: theme.schema.textColor,
 *   isRTL: isRTLLocale(locale)
 * };
 * ```
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  type MoodSchema,
  type MoodSchemaType,
  type ResolvedTheme,
  type SchemasJSON,
  type SchemaMap,
  type WorkspaceThemeOverride,
  type ThemeValidationResult,
  isMoodSchemaType,
} from "./mood-schema-types";

let cachedSchemaMap: SchemaMap | null = null;
let cachedSchemasJSON: SchemasJSON | null = null;

/**
 * Load schemas.json from disk (cached in memory after first load)
 * Safe for server-side runtime; schemas.json is bundled with Next.js build
 */
function loadSchemasJSON(): SchemasJSON {
  if (cachedSchemasJSON) {
    return cachedSchemasJSON;
  }

  try {
    const schemaPath = join(process.cwd(), "src/lib/gemini/schemas.json");
    const content = readFileSync(schemaPath, "utf-8");
    cachedSchemasJSON = JSON.parse(content) as SchemasJSON;
    return cachedSchemasJSON;
  } catch (error) {
    console.error("Failed to load schemas.json:", error);
    throw new Error(
      "Theme schemas not found. Ensure lib/gemini/schemas.json exists."
    );
  }
}

/**
 * Build SchemaMap for fast O(1) lookups
 */
function buildSchemaMap(): SchemaMap {
  if (cachedSchemaMap) {
    return cachedSchemaMap;
  }

  const schemasJSON = loadSchemasJSON();
  cachedSchemaMap = {} as SchemaMap;

  schemasJSON.schemas.forEach((schema) => {
    if (isMoodSchemaType(schema.id)) {
      cachedSchemaMap![schema.id] = schema;
    }
  });

  return cachedSchemaMap;
}

/**
 * Get a base schema by ID
 * @example
 * ```typescript
 * const schema = getBaseSchema("minimalist-professional");
 * ```
 */
export function getBaseSchema(schemaId: MoodSchemaType): MoodSchema {
  const schemaMap = buildSchemaMap();
  const schema = schemaMap[schemaId];

  if (!schema) {
    throw new Error(`Schema not found: ${schemaId}`);
  }

  return schema;
}

/**
 * Get all available base schemas
 */
export function getAllBaseSchemas(): MoodSchema[] {
  return Object.values(buildSchemaMap());
}

/**
 * Validate a MoodSchema structure
 * Ensures required fields are present and types are correct
 */
export function validateSchema(schema: unknown): ThemeValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!schema || typeof schema !== "object") {
    errors.push("Schema must be an object");
    return { valid: false, errors, warnings };
  }

  const s = schema as Record<string, unknown>;

  // Required fields
  if (typeof s.id !== "string") errors.push("Missing or invalid id");
  if (typeof s.primaryColor !== "string") errors.push("Missing primaryColor");
  if (typeof s.textColor !== "string") errors.push("Missing textColor");
  if (typeof s.fontStyle !== "string") errors.push("Missing fontStyle");
  if (typeof s.shadowProfile !== "string") errors.push("Missing shadowProfile");
  if (typeof s.luminance !== "string") errors.push("Missing luminance");

  // RTL support
  if (!s.rtlOverrides || typeof s.rtlOverrides !== "object") {
    warnings.push("RTL overrides not defined; defaulting to LTR behavior");
  } else {
    const rtl = s.rtlOverrides as Record<string, unknown>;
    if (rtl.enabled !== true) {
      warnings.push("RTL disabled for this schema");
    }
  }

  // Color format validation (basic hex check)
  const hexRegex = /^#[0-9A-Fa-f]{6}$/;
  [s.primaryColor, s.textColor, s.backgroundColor].forEach((color) => {
    if (typeof color === "string" && !hexRegex.test(color)) {
      warnings.push(`Invalid hex color: ${color}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Merge workspace override into base schema
 * Creates a new schema object with workspace-specific customizations
 *
 * @param baseSchema - The base schema from schemas.json
 * @param override - Workspace-specific customizations (partial)
 * @returns New MoodSchema with overrides applied
 */
export function mergeSchemaOverride(
  baseSchema: MoodSchema,
  override: WorkspaceThemeOverride
): MoodSchema {
  const merged = { ...baseSchema };

  // Apply color overrides
  if (override.colorOverrides) {
    if (override.colorOverrides.primaryColor) {
      merged.primaryColor = override.colorOverrides.primaryColor;
    }
    if (override.colorOverrides.secondaryColor) {
      merged.secondaryColor = override.colorOverrides.secondaryColor;
    }
    if (override.colorOverrides.accentColor) {
      merged.accentColor = override.colorOverrides.accentColor;
    }
    if (override.colorOverrides.backgroundColor) {
      merged.backgroundColor = override.colorOverrides.backgroundColor;
    }
    if (override.colorOverrides.textColor) {
      merged.textColor = override.colorOverrides.textColor;
    }
  }

  // Apply typography overrides
  if (override.typographyOverrides) {
    if (override.typographyOverrides.fontStyle) {
      merged.fontStyle = override.typographyOverrides.fontStyle;
    }
    if (override.typographyOverrides.shadowProfile) {
      merged.shadowProfile = override.typographyOverrides.shadowProfile;
    }
  }

  // Apply RTL overrides if present
  if (override.rtlOverrides) {
    merged.rtlOverrides = {
      ...merged.rtlOverrides,
      ...override.rtlOverrides,
    };
  }

  return merged;
}

/**
 * Load theme for a workspace with override support
 *
 * Resolution order:
 * 1. Check for active workspace override
 * 2. Fall back to base schema from schemas.json
 * 3. Return resolved theme with metadata
 *
 * @param workspaceId - Workspace ID
 * @param schemaId - Base schema ID (fallback)
 * @param override - Optional workspace override (from database or cache)
 * @returns Resolved theme ready for compositing engine
 *
 * @example
 * ```typescript
 * const theme = await loadThemeForWorkspace(
 *   "workspace123",
 *   "minimalist-professional"
 * );
 *
 * const layoutMap: LayoutMap = {
 *   primaryColor: theme.schema.primaryColor,
 *   textColor: theme.schema.textColor,
 *   // ... other fields
 * };
 * ```
 */
export async function loadThemeForWorkspace(
  workspaceId: string,
  schemaId: MoodSchemaType,
  override?: WorkspaceThemeOverride | null
): Promise<ResolvedTheme> {
  // Load base schema
  const baseSchema = getBaseSchema(schemaId);

  // If no override, return base schema
  if (!override || !override.isActive) {
    return {
      schema: baseSchema,
      isCustom: false,
      source: "base-schema",
    };
  }

  // Merge override into base schema
  const mergedSchema = mergeSchemaOverride(baseSchema, override);

  return {
    schema: mergedSchema,
    isCustom: true,
    source: "workspace-override",
    override,
  };
}

/**
 * Load theme for a workspace from database
 * This is what API routes should call
 *
 * @param workspaceId - Workspace ID
 * @param schemaId - Base schema ID
 * @param dbLookup - Optional function to fetch override from database
 * @returns Resolved theme
 */
export async function loadThemeWithDatabaseLookup(
  workspaceId: string,
  schemaId: MoodSchemaType,
  dbLookup?: (workspaceId: string, schemaId: MoodSchemaType) => Promise<WorkspaceThemeOverride | null>
): Promise<ResolvedTheme> {
  let override: WorkspaceThemeOverride | null = null;

  if (dbLookup) {
    try {
      override = await dbLookup(workspaceId, schemaId);
    } catch (error) {
      console.error(
        `Failed to load theme override for workspace ${workspaceId}:`,
        error
      );
      // Fall back to base schema on database error
    }
  }

  return loadThemeForWorkspace(workspaceId, schemaId, override);
}

/**
 * Validate RTL support for a schema
 * Called before generating RTL content (Arabic/Hebrew)
 *
 * @param schema - The MoodSchema to validate
 * @returns Whether schema supports RTL
 */
export function supportsRTL(schema: MoodSchema): boolean {
  return (
    schema.rtlOverrides &&
    schema.rtlOverrides.enabled &&
    schema.rtlOverrides.mirrorAssets
  );
}

/**
 * Get RTL text alignment for a schema
 * Used by compositing engine to position text zones correctly
 *
 * @param schema - The MoodSchema
 * @returns Text alignment: "left" | "right" | "center"
 */
export function getRTLTextAlignment(schema: MoodSchema): "left" | "right" | "center" {
  return schema.rtlOverrides?.textAlignment ?? "right";
}

/**
 * Get all schemas compatible with a category
 * Useful for category-specific theme recommendations
 *
 * @param category - App category (e.g., "games", "health", "productivity")
 * @returns Array of compatible schemas
 */
export function getSchemasForCategory(category: string): MoodSchema[] {
  return getAllBaseSchemas().filter((schema) =>
    schema.categoryAffinities.includes(category)
  );
}

/**
 * Get schema recommendations for a locale
 * RTL schemas are filtered for Arabic/Hebrew
 *
 * @param locale - Locale code (e.g., "en", "ar", "he")
 * @returns Array of recommended schemas
 */
export function getSchemasForLocale(locale: string): MoodSchema[] {
  const isRTL = locale === "ar" || locale === "he";
  const allSchemas = getAllBaseSchemas();

  if (isRTL) {
    // For RTL, return only schemas with RTL support enabled
    return allSchemas.filter((s) => supportsRTL(s));
  }

  // For LTR, return all schemas
  return allSchemas;
}

/**
 * Invalidate cache (useful for testing or admin operations)
 */
export function invalidateThemeCache(): void {
  cachedSchemaMap = null;
  cachedSchemasJSON = null;
}
