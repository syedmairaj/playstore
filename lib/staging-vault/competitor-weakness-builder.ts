/**
 * COMPETITOR WEAKNESS PAYLOAD BUILDER
 *
 * Transforms raw competitor data (keywords, vulnerabilities) into
 * UnifiedStagingPayload that matches the strict schema required
 * by useStaging hook and workspace_staging_vault database.
 *
 * This ensures:
 * - JSON serialization works correctly (no 22P02 errors)
 * - Competitor isolation works (metadata->competitor_id is set)
 * - Language context is preserved (EN/AR separation)
 * - Keywords are grouped by strategy
 */

import { UnifiedStagingPayload, LanguageCode } from '@/types/staging-contract';

export interface CompetitorWeaknessInput {
  competitorId: string;
  competitorName: string;
  categoryLabel: string;
  keywords: string[];
  vulnerabilities: string[];
  language: LanguageCode;
  isRtl: boolean;
  workspaceId: string;
}

/**
 * Build a UnifiedStagingPayload for competitor_weakness signals
 * This is what gets sent to useStaging.stage()
 */
export function buildCompetitorWeaknessPayload(
  input: CompetitorWeaknessInput
): UnifiedStagingPayload {
  // Group keywords by strategy (simple equal split)
  const third = Math.ceil(input.keywords.length / 3);
  const twoThirds = Math.ceil((input.keywords.length * 2) / 3);

  const keywordsByStrategy = {
    high_volume: input.keywords.slice(0, third),
    intent_based: input.keywords.slice(third, twoThirds),
    competitor_gap: input.keywords.slice(twoThirds),
  };

  /**
   * CRITICAL: This structure is what the GET endpoint expects in metadata
   * The API filters by: metadata->competitor_id = competitorId
   * So competitor_id MUST be in metadata for isolation to work
   */
  return {
    // Core contract fields (required by UnifiedStagingPayload)
    source: 'competitor_spy',
    category: 'competitor_weakness',
    intent: 'competitor_weakness',
    content_array: input.keywords,
    lang: input.language,
    is_rtl: input.isRtl,

    // Optional fields
    sourceContextId: input.competitorId,
    workspaceId: input.workspaceId,

    // CRITICAL: Metadata must contain competitor isolation fields
    // This is what enables 3D isolation: (workspace_id, competitor_id, language)
    metadata: {
      competitor_id: input.competitorId,  // ← ISOLATION KEY 1
      competitor_name: input.competitorName,
      category_label: input.categoryLabel,
      language: input.language,  // ← ISOLATION KEY 3 (redundant but explicit)

      // Keywords grouped by strategy (used by UI)
      keywords_by_strategy: keywordsByStrategy,

      // Supporting data
      vulnerabilities: input.vulnerabilities,
      total_keywords: input.keywords.length,
      vulnerability_count: input.vulnerabilities.length,
      is_rtl: input.isRtl,
    },

    // Display labels
    title: `Competitor Weakness: ${input.competitorName}`,
    description: `Found ${input.keywords.length} keywords for ${input.categoryLabel}`,
  };
}

/**
 * Validate competitor weakness input before building payload
 */
export function validateCompetitorWeaknessInput(
  input: Partial<CompetitorWeaknessInput>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!input.competitorId?.trim()) {
    errors.push('competitorId is required');
  }

  if (!input.competitorName?.trim()) {
    errors.push('competitorName is required');
  }

  if (!input.categoryLabel?.trim()) {
    errors.push('categoryLabel is required');
  }

  if (!input.workspaceId?.trim()) {
    errors.push('workspaceId is required');
  }

  if (!Array.isArray(input.keywords) || input.keywords.length === 0) {
    errors.push('keywords must be a non-empty array');
  }

  if (!Array.isArray(input.vulnerabilities)) {
    errors.push('vulnerabilities must be an array');
  }

  if (!input.language || !['en', 'ar'].includes(input.language)) {
    errors.push("language must be 'en' or 'ar'");
  }

  if (typeof input.isRtl !== 'boolean') {
    errors.push('isRtl must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build payload and validate in one step
 */
export function buildOrThrow(input: CompetitorWeaknessInput): UnifiedStagingPayload {
  const validation = validateCompetitorWeaknessInput(input);

  if (!validation.valid) {
    throw new Error(
      `Invalid competitor weakness input:\n${validation.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }

  return buildCompetitorWeaknessPayload(input);
}
