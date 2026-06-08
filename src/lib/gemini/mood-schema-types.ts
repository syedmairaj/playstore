/**
 * Mood Schema Types & Interfaces
 *
 * Supports full LTR/RTL parity for English and Arabic markets.
 * Schemas are decoupled into schemas.json and loaded at runtime.
 *
 * The compositing engine (lib/screenshot/compose-screenshot.ts) is agnostic to these types—
 * it only cares about color values and text zones. RTL transformation happens via flop().
 */

/**
 * RTL-specific overrides for a schema
 * Applied when generating for Arabic (ar) or Hebrew (he) locales
 */
export interface RTLOverride {
  /** Whether this schema supports RTL rendering */
  enabled: boolean;

  /** Whether to horizontally mirror assets (done by compositing engine via flop()) */
  mirrorAssets: boolean;

  /** Text alignment for RTL: "left" | "right" | "center" (used by compositing engine) */
  textAlignment: "left" | "right" | "center";

  /** Gesture profile optimized for RTL (same types as main schema) */
  gestureProfile?: string;

  /** Implementation notes for RTL behavior */
  notes?: string;
}

/**
 * Complete Mood Schema definition
 * Represents one complete theme with color, typography, and layout guidance
 */
export interface MoodSchema {
  /** Unique identifier (kebab-case) */
  id: MoodSchemaType;

  /** Display name for UI */
  label: string;

  /** Description for schema picker */
  description: string;

  /** App categories this schema pairs well with */
  categoryAffinities: string[];

  // Color Palette
  /** Brand primary color (hex) */
  primaryColor: string;

  /** Secondary accent color (hex) */
  secondaryColor: string;

  /** Tertiary accent for highlights (hex) */
  accentColor: string;

  /** Background color (hex) */
  backgroundColor: string;

  /** Text color (hex) */
  textColor: string;

  // Typography & Aesthetics
  /** Font personality: "clean" | "bold" | "elegant" | "none" */
  fontStyle: "clean" | "bold" | "elegant" | "none";

  /** Shadow depth: "subtle" | "soft" | "dynamic" | "strong" | "refined" */
  shadowProfile: "subtle" | "soft" | "dynamic" | "strong" | "refined";

  /** Background luminance: "very-high" | "high" | "medium" | "dark" | "mixed" */
  luminance: "very-high" | "high" | "medium" | "dark" | "mixed";

  /** Design energy: "calm" | "balanced" | "high" | "extreme" | "serene" */
  energyLevel: "calm" | "balanced" | "high" | "extreme" | "serene";

  /** Animation style: "static" | "flowing" | "animated" | "impactful" | "graceful" */
  gestureProfile: "static" | "flowing" | "animated" | "impactful" | "graceful";

  /** Shape language: "geometric" | "organic" | "angular" */
  shapeLanguage: "geometric" | "organic" | "angular";

  /** Pattern density: "sparse" | "low" | "moderate" | "dense" */
  patternDensity: "sparse" | "low" | "moderate" | "dense";

  /** Contrast ratio multiplier (1.0 = neutral, 2.0 = extreme) */
  contrastRatio: number;

  // RTL Support
  /** RTL-specific overrides for Arabic/Hebrew markets */
  rtlOverrides: RTLOverride;
}

/**
 * Union type of all valid schema IDs
 * Used for type-safe schema selection
 */
export type MoodSchemaType =
  | "minimalist-professional"
  | "energetic-tech"
  | "organic-health"
  | "high-contrast-bold"
  | "luxury-premium";

/**
 * Type guard: Check if a string is a valid MoodSchemaType
 * @example
 * ```typescript
 * if (isMoodSchemaType(id)) {
 *   const schema = MOOD_SCHEMAS[id];
 * }
 * ```
 */
export function isMoodSchemaType(value: unknown): value is MoodSchemaType {
  const validIds: MoodSchemaType[] = [
    "minimalist-professional",
    "energetic-tech",
    "organic-health",
    "high-contrast-bold",
    "luxury-premium",
  ];
  return typeof value === "string" && validIds.includes(value as MoodSchemaType);
}

/**
 * Workspace-specific theme override
 * Premium users can customize themes per workspace
 */
export interface WorkspaceThemeOverride {
  id: string;
  workspaceId: string;

  /** Base schema ID this override extends */
  baseSchemaId: MoodSchemaType;

  /** Custom label for this variant */
  label: string;

  /** Color overrides (partial, merged with base schema) */
  colorOverrides?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
  };

  /** Typography overrides */
  typographyOverrides?: {
    fontStyle?: "clean" | "bold" | "elegant" | "none";
    shadowProfile?: "subtle" | "soft" | "dynamic" | "strong" | "refined";
  };

  /** Whether this override is active */
  isActive: boolean;

  /** When this override was created */
  createdAt: string;

  /** When this override was last modified */
  updatedAt: string;

  /** RTL-specific adjustments for this override */
  rtlOverrides?: Partial<RTLOverride>;
}

/**
 * Loaded theme with workspace overrides merged
 * This is what the compositing engine receives
 */
export interface ResolvedTheme {
  /** The final schema after merging workspace overrides */
  schema: MoodSchema;

  /** Whether this is a custom override or a base schema */
  isCustom: boolean;

  /** Source: "workspace-override" | "base-schema" */
  source: "workspace-override" | "base-schema";

  /** The override object if source is workspace-override */
  override?: WorkspaceThemeOverride;
}

/**
 * JSON structure of schemas.json file
 * Loaded at build time or cached in memory
 */
export interface SchemasJSON {
  schemas: MoodSchema[];
  metadata: {
    version: string;
    lastUpdated: string;
    description: string;
    designPhilosophy: {
      rtlSupport: string;
      colorParity: string;
      symmetry: string;
    };
    fontStyles: Record<string, string>;
    shadowProfiles: Record<string, string>;
    luminanceGuidelines: Record<string, string>;
    gestureProfiles: Record<string, string>;
  };
}

/**
 * Map of all schemas for fast lookup
 * Built from schemas.json at runtime
 */
export type SchemaMap = Record<MoodSchemaType, MoodSchema>;

/**
 * Validation result for theme loading
 */
export interface ThemeValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
