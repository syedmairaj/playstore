/**
 * BRAND MIRROR ENGINE - WORKSPACE STAGING VAULT SCHEMA
 *
 * This file defines the SINGLE SOURCE OF TRUTH for all data serialization.
 * Every module (Competitor Spy, Review Insights, Keyword Tracker, etc.)
 * must conform to this schema when writing to workspace_staging_vault.
 *
 * CRITICAL RULES:
 * 1. The `metadata` column MUST be a native JavaScript object (NOT stringified)
 * 2. The `content` column MUST be a JSON string (stringified for storage)
 * 3. All signal_type values MUST match exactly between INSERT and SELECT
 * 4. All language values MUST be 'en' or 'ar' (no other formats)
 *
 * This prevents:
 * - 22P02: invalid input syntax for type json (double-encoding)
 * - NULL competitor_id
 * - NULL keywords
 * - "No keywords found" errors
 */

/**
 * STANDARDIZED SCHEMA: competitor_weakness signal
 * Used by: Competitor Spy module
 */
export interface CompetitorWeaknessSignalSchema {
  // ═══════════════════════════════════════════════════════════════════════
  // DATABASE COLUMNS (match workspace_staging_vault table schema)
  // ═══════════════════════════════════════════════════════════════════════

  workspace_id: string;
  signal_type: 'competitor_weakness';  // ← EXACT match required
  source: 'competitor_spy' | 'manual' | 'api';
  source_context: string;
  source_context_id: string;
  content: string;  // ← JSON STRING (stringified by prepareVaultPayload)
  language: 'en' | 'ar';  // ← ONLY these two values
  metadata: CompetitorWeaknessMetadata;  // ← NATIVE OBJECT (NOT stringified)

  // Optional columns
  source_app_id?: string;
  expires_at?: string;
}

/**
 * THE METADATA STRUCTURE
 * This is the JSONB column in Supabase that stores flexible data.
 * Supabase handles JSON serialization automatically - DO NOT stringify this.
 */
export interface CompetitorWeaknessMetadata {
  // ═══════════════════════════════════════════════════════════════════════
  // ISOLATION KEYS (used for retrieval filtering)
  // ═══════════════════════════════════════════════════════════════════════

  competitor_id: string;  // ← REQUIRED: Used for filtering in SELECT queries
  competitor_name: string;  // ← REQUIRED: Human-readable name
  category_label: string;  // ← REQUIRED: Domain context

  // ═══════════════════════════════════════════════════════════════════════
  // LANGUAGE & DISPLAY
  // ═══════════════════════════════════════════════════════════════════════

  language: 'en' | 'ar';  // ← REQUIRED: Matches root language column
  is_rtl: boolean;  // ← REQUIRED: true for Arabic, false for English

  // ═══════════════════════════════════════════════════════════════════════
  // KEYWORDS (structured by AI strategy)
  // ═══════════════════════════════════════════════════════════════════════

  keywords_by_strategy: {
    high_volume: string[];  // Keywords with high search volume
    intent_based: string[];  // Keywords with commercial/transaction intent
    competitor_gap: string[];  // Keywords competitors target but user doesn't
  };

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLEMENTARY DATA
  // ═══════════════════════════════════════════════════════════════════════

  vulnerabilities: string[];  // Optional: competitor weaknesses
  total_keywords?: number;  // Optional: count for reference
  vulnerability_count?: number;  // Optional: count for reference
}

/**
 * VALIDATION: Enforce schema at compile time and runtime
 */
export function validateCompetitorWeaknessSchema(
  data: any
): {
  valid: boolean;
  errors: string[];
  schema?: CompetitorWeaknessSignalSchema;
} {
  const errors: string[] = [];

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1: Validate root columns
  // ═══════════════════════════════════════════════════════════════════════

  if (typeof data.workspace_id !== 'string' || !data.workspace_id.trim()) {
    errors.push('workspace_id: must be non-empty string');
  }

  if (data.signal_type !== 'competitor_weakness') {
    errors.push(`signal_type: MUST be exactly 'competitor_weakness', got '${data.signal_type}'`);
  }

  if (typeof data.source !== 'string' || !['competitor_spy', 'manual', 'api'].includes(data.source)) {
    errors.push(`source: must be one of: competitor_spy, manual, api. Got '${data.source}'`);
  }

  if (typeof data.content !== 'string' || !data.content.trim()) {
    errors.push('content: must be non-empty JSON string');
  }

  if (!['en', 'ar'].includes(data.language)) {
    errors.push(`language: MUST be exactly 'en' or 'ar', got '${data.language}'`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2: Validate metadata is OBJECT (not string!)
  // ═══════════════════════════════════════════════════════════════════════

  if (typeof data.metadata !== 'object' || data.metadata === null || Array.isArray(data.metadata)) {
    errors.push(
      `metadata: MUST be a native object. Got ${typeof data.metadata}. ` +
      `DO NOT stringify metadata - Supabase handles JSONB serialization automatically.`
    );
    return { valid: false, errors };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3: Validate metadata fields (isolation keys)
  // ═══════════════════════════════════════════════════════════════════════

  const meta = data.metadata as Record<string, any>;

  if (typeof meta.competitor_id !== 'string' || !meta.competitor_id.trim()) {
    errors.push(
      'metadata.competitor_id: REQUIRED, must be non-empty string. ' +
      'This field is used to filter results in SELECT queries.'
    );
  }

  if (typeof meta.competitor_name !== 'string' || !meta.competitor_name.trim()) {
    errors.push('metadata.competitor_name: REQUIRED, must be non-empty string');
  }

  if (typeof meta.category_label !== 'string' || !meta.category_label.trim()) {
    errors.push('metadata.category_label: REQUIRED, must be non-empty string');
  }

  if (!['en', 'ar'].includes(meta.language)) {
    errors.push(
      `metadata.language: MUST be exactly 'en' or 'ar', got '${meta.language}'. ` +
      `Should match root language column.`
    );
  }

  if (typeof meta.is_rtl !== 'boolean') {
    errors.push(
      `metadata.is_rtl: MUST be boolean. Got ${typeof meta.is_rtl}. ` +
      `true for Arabic, false for English.`
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 4: Validate keywords_by_strategy structure
  // ═══════════════════════════════════════════════════════════════════════

  if (!meta.keywords_by_strategy || typeof meta.keywords_by_strategy !== 'object') {
    errors.push('metadata.keywords_by_strategy: REQUIRED, must be an object');
  } else {
    const kbs = meta.keywords_by_strategy;

    if (!Array.isArray(kbs.high_volume)) {
      errors.push('metadata.keywords_by_strategy.high_volume: must be string array');
    }
    if (!Array.isArray(kbs.intent_based)) {
      errors.push('metadata.keywords_by_strategy.intent_based: must be string array');
    }
    if (!Array.isArray(kbs.competitor_gap)) {
      errors.push('metadata.keywords_by_strategy.competitor_gap: must be string array');
    }

    const totalKeywords =
      (kbs.high_volume?.length || 0) +
      (kbs.intent_based?.length || 0) +
      (kbs.competitor_gap?.length || 0);

    if (totalKeywords === 0) {
      errors.push(
        'metadata.keywords_by_strategy: must have at least 1 keyword across all categories'
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 5: Validate vulnerabilities (optional but must be array if present)
  // ═══════════════════════════════════════════════════════════════════════

  if (meta.vulnerabilities !== undefined && !Array.isArray(meta.vulnerabilities)) {
    errors.push('metadata.vulnerabilities: if present, must be an array');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 6: Test JSON round-trip (catch serialization issues early)
  // ═══════════════════════════════════════════════════════════════════════

  try {
    const stringified = JSON.stringify(meta);
    JSON.parse(stringified);
  } catch (err) {
    errors.push(
      `metadata: Failed JSON serialization round-trip. ` +
      `This usually means circular references or non-serializable values. Error: ${err}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    schema: errors.length === 0 ? (data as CompetitorWeaknessSignalSchema) : undefined,
  };
}

/**
 * BUILDER: Create a valid CompetitorWeaknessSignalSchema
 * Use this to ensure all signals conform to the standard schema.
 */
export function buildCompetitorWeaknessSchema(input: {
  workspaceId: string;
  competitorId: string;
  competitorName: string;
  categoryLabel: string;
  keywords: string[];  // Will be split into strategy groups
  vulnerabilities?: string[];
  language: 'en' | 'ar';
}): CompetitorWeaknessSignalSchema {
  // Group keywords by strategy
  const third = Math.ceil(input.keywords.length / 3);
  const twoThirds = Math.ceil((input.keywords.length * 2) / 3);

  // ═══════════════════════════════════════════════════════════════════════
  // BUILD METADATA AS NATIVE OBJECT (DO NOT STRINGIFY)
  // ═══════════════════════════════════════════════════════════════════════

  const metadata: CompetitorWeaknessMetadata = {
    competitor_id: input.competitorId,
    competitor_name: input.competitorName,
    category_label: input.categoryLabel,
    language: input.language,
    is_rtl: input.language === 'ar',
    keywords_by_strategy: {
      high_volume: input.keywords.slice(0, third),
      intent_based: input.keywords.slice(third, twoThirds),
      competitor_gap: input.keywords.slice(twoThirds),
    },
    vulnerabilities: input.vulnerabilities || [],
    total_keywords: input.keywords.length,
    vulnerability_count: input.vulnerabilities?.length || 0,
  };

  // ═══════════════════════════════════════════════════════════════════════
  // BUILD CONTENT AS JSON STRING (must be stringified)
  // ═══════════════════════════════════════════════════════════════════════

  const content = JSON.stringify({
    keywords: input.keywords,
    vulnerabilities: input.vulnerabilities || [],
    language: input.language,
    strategy: 'competitor_weakness_analysis',
  });

  return {
    workspace_id: input.workspaceId,
    signal_type: 'competitor_weakness',
    source: 'competitor_spy',
    source_context: input.categoryLabel,
    source_context_id: input.competitorId,
    content,  // ← STRING
    language: input.language,
    metadata,  // ← NATIVE OBJECT (NOT stringified)
  };
}

/**
 * BUILD AND VALIDATE
 * Use this when you want to build + validate in one step
 */
export function buildAndValidateSchema(input: Parameters<typeof buildCompetitorWeaknessSchema>[0]): {
  valid: boolean;
  errors: string[];
  schema?: CompetitorWeaknessSignalSchema;
} {
  const schema = buildCompetitorWeaknessSchema(input);
  return validateCompetitorWeaknessSchema(schema);
}
