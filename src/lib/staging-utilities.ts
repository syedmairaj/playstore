/**
 * STAGING UTILITIES
 *
 * Reusable, pure functions for:
 * - Payload validation
 * - Content transformation
 * - Language-based filtering
 * - Content sanitization
 * - Metadata enrichment
 *
 * These utilities are used by useStaging hook and consumed by feature modules.
 * Keep them pure (no side effects) and well-tested!
 */

import {
  UnifiedStagingPayload,
  LanguageCode,
  StagingVaultRecord,
  isRtlLanguage,
} from '@/types/staging-contract';

/**
 * VALIDATION UTILITIES
 */

/**
 * Validate that content_array contains valid items
 * @param content_array Array of strings or objects
 * @returns { valid: boolean; message: string }
 */
export function validateContentArray(
  content_array: (string | Record<string, any>)[]
): { valid: boolean; message: string } {
  if (!Array.isArray(content_array)) {
    return { valid: false, message: 'content_array must be an array' };
  }

  if (content_array.length === 0) {
    return { valid: false, message: 'content_array cannot be empty' };
  }

  // Check for invalid items
  const invalidItems = content_array.filter(
    (item) => typeof item !== 'string' && typeof item !== 'object'
  );

  if (invalidItems.length > 0) {
    return {
      valid: false,
      message: `content_array contains ${invalidItems.length} invalid items (must be string or object)`,
    };
  }

  // Check string length (max 5000 chars total)
  const totalLength = content_array
    .map((item) => (typeof item === 'string' ? item.length : JSON.stringify(item).length))
    .reduce((a, b) => a + b, 0);

  if (totalLength > 5000) {
    return { valid: false, message: `content_array exceeds 5000 character limit (${totalLength})` };
  }

  return { valid: true, message: 'Content array is valid' };
}

/**
 * Validate language code
 * @param lang Language code
 * @returns { valid: boolean; message: string }
 */
export function validateLanguage(lang: any): { valid: boolean; message: string } {
  const validLanguages: LanguageCode[] = ['en', 'ar'];

  if (!lang || typeof lang !== 'string') {
    return { valid: false, message: 'Language must be a non-empty string' };
  }

  if (!validLanguages.includes(lang as LanguageCode)) {
    return {
      valid: false,
      message: `Language must be one of: ${validLanguages.join(', ')} (got: '${lang}')`,
    };
  }

  return { valid: true, message: `Language '${lang}' is valid` };
}

/**
 * TRANSFORMATION UTILITIES
 */

/**
 * Sanitize content strings (remove extra whitespace, trim)
 * @param content_array Raw content array
 * @returns Sanitized content array
 */
export function sanitizeContent(
  content_array: (string | Record<string, any>)[]
): (string | Record<string, any>)[] {
  return content_array.map((item) => {
    if (typeof item === 'string') {
      // Trim and remove extra spaces
      return item
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    }
    // Return objects as-is
    return item;
  });
}

/**
 * Deduplicate content array
 * Removes exact duplicates while preserving order
 * @param content_array Content array
 * @returns Deduplicated array
 */
export function deduplicateContent(
  content_array: (string | Record<string, any>)[]
): (string | Record<string, any>)[] {
  const seen = new Set<string>();
  return content_array.filter((item) => {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract keywords from content array
 * Assumes keywords are strings in the array
 * @param content_array Content array
 * @returns Array of keyword strings
 */
export function extractKeywords(content_array: (string | Record<string, any>)[]): string[] {
  return content_array.filter((item) => typeof item === 'string') as string[];
}

/**
 * Group keywords by metadata category
 * @param keywords Array of keyword strings
 * @param categories Category names
 * @returns Object with keywords grouped by category
 *
 * Example:
 * groupKeywordsByCategory(['fitness', 'health', 'nutrition'], 3)
 * Returns: {
 *   'category_0': ['fitness'],
 *   'category_1': ['health'],
 *   'category_2': ['nutrition']
 * }
 */
export function groupKeywordsByCategory(
  keywords: string[],
  categoryCount: number = 3
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const itemsPerCategory = Math.ceil(keywords.length / categoryCount);

  for (let i = 0; i < categoryCount; i++) {
    const categoryKey = `category_${i}`;
    const start = i * itemsPerCategory;
    const end = Math.min(start + itemsPerCategory, keywords.length);
    groups[categoryKey] = keywords.slice(start, end);
  }

  return groups;
}

/**
 * FILTERING UTILITIES
 */

/**
 * Filter staging vault records by language
 * @param records Array of staging vault records
 * @param lang Language to filter by
 * @returns Filtered records
 */
export function filterByLanguage(
  records: StagingVaultRecord[],
  lang: LanguageCode
): StagingVaultRecord[] {
  return records.filter((record) => record.language === lang);
}

/**
 * Filter staging vault records by signal type
 * @param records Array of staging vault records
 * @param signalType Signal type (competitor_weakness, review_issue, etc.)
 * @returns Filtered records
 */
export function filterBySignalType(
  records: StagingVaultRecord[],
  signalType: string
): StagingVaultRecord[] {
  return records.filter((record) => record.signal_type === signalType);
}

/**
 * Filter by source module
 * @param records Array of staging vault records
 * @param source Source module (competitor_spy, review_analysis, etc.)
 * @returns Filtered records
 */
export function filterBySource(records: StagingVaultRecord[], source: string): StagingVaultRecord[] {
  return records.filter((record) => record.source === source);
}

/**
 * Multi-filter: Get records by language AND signal type AND source
 * @param records Array of staging vault records
 * @param filters Object with lang, signalType, source
 * @returns Filtered records
 */
export function filterByMultiple(
  records: StagingVaultRecord[],
  filters: Partial<{
    lang: LanguageCode;
    signalType: string;
    source: string;
    workspace: string;
  }>
): StagingVaultRecord[] {
  return records.filter((record) => {
    if (filters.lang && record.language !== filters.lang) return false;
    if (filters.signalType && record.signal_type !== filters.signalType) return false;
    if (filters.source && record.source !== filters.source) return false;
    if (filters.workspace && record.workspace_id !== filters.workspace) return false;
    return true;
  });
}

/**
 * METADATA UTILITIES
 */

/**
 * Enrich payload metadata with standard fields
 * @param baseMetadata Base metadata object
 * @param source Source module
 * @param lang Language
 * @returns Enriched metadata
 */
export function enrichMetadata(
  baseMetadata: Record<string, any> | undefined,
  source: string,
  lang: LanguageCode
): Record<string, any> {
  return {
    ...baseMetadata,
    _source: source,
    _lang: lang,
    _isRtl: isRtlLanguage(lang),
    _timestamp: new Date().toISOString(),
    _userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  };
}

/**
 * Extract metadata field value with fallback
 * @param metadata Metadata object
 * @param path Dot-notation path (e.g., 'competitor.name')
 * @param defaultValue Fallback value
 * @returns Value or default
 */
export function getMetadataField(
  metadata: Record<string, any> | undefined,
  path: string,
  defaultValue: any = null
): any {
  if (!metadata) return defaultValue;

  const keys = path.split('.');
  let value = metadata;

  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }

  return value ?? defaultValue;
}

/**
 * PAYLOAD BUILDING UTILITIES
 */

/**
 * Build a complete payload for Competitor Spy module
 * @param competitorName Name of competitor app
 * @param keywords Array of keywords
 * @param metadata Additional metadata (bestRank, category, etc.)
 * @param lang Language
 * @returns Complete UnifiedStagingPayload
 */
export function buildCompetitorSpyPayload(
  competitorName: string,
  keywords: string[],
  metadata: Record<string, any>,
  lang: LanguageCode = 'en'
): UnifiedStagingPayload {
  return {
    source: 'competitor_spy',
    category: 'competitor_weakness',
    intent: 'competitor_weakness',
    content_array: keywords,
    lang,
    is_rtl: isRtlLanguage(lang),
    metadata: {
      competitorName,
      keywordCount: keywords.length,
      ...metadata,
    },
    title: `Competitor Weakness: ${competitorName}`,
    description: `Found ${keywords.length} competitive keywords from ${competitorName}`,
  };
}

/**
 * Build payload for Review Analysis module
 * @param issues Array of review issue strings
 * @param metadata Additional context (severity, app, etc.)
 * @param lang Language
 * @returns Complete UnifiedStagingPayload
 */
export function buildReviewAnalysisPayload(
  issues: string[],
  metadata: Record<string, any>,
  lang: LanguageCode = 'en'
): UnifiedStagingPayload {
  return {
    source: 'review_analysis',
    category: 'review_issue',
    intent: 'review_issue',
    content_array: issues,
    lang,
    is_rtl: isRtlLanguage(lang),
    metadata: {
      issueCount: issues.length,
      ...metadata,
    },
    title: `Review Insights: ${metadata.appName || 'Your App'}`,
    description: `Found ${issues.length} common review issues`,
  };
}

/**
 * Build payload for Keyword Tracker module
 * @param keywords Array of keyword strings
 * @param metadata Rank info, volume, difficulty, etc.
 * @param lang Language
 * @returns Complete UnifiedStagingPayload
 */
export function buildKeywordTrackerPayload(
  keywords: string[],
  metadata: Record<string, any>,
  lang: LanguageCode = 'en'
): UnifiedStagingPayload {
  return {
    source: 'keyword_tracker',
    category: 'keyword',
    intent: 'keyword',
    content_array: keywords,
    lang,
    is_rtl: isRtlLanguage(lang),
    metadata: {
      keywordCount: keywords.length,
      ...metadata,
    },
    title: 'Tracked Keywords',
    description: `Staged ${keywords.length} tracked keywords for analysis`,
  };
}

/**
 * LOGGING UTILITIES
 */

/**
 * Log payload verification details
 * @param source Source module identifier
 * @param payload Unified staging payload
 */
export function logPayloadVerification(source: string, payload: UnifiedStagingPayload): void {
  console.group(`[useStaging] [${source.toUpperCase()}] PAYLOAD VERIFICATION`);
  console.log(`  source: ${payload.source}`);
  console.log(`  category: ${payload.category}`);
  console.log(`  intent: ${payload.intent}`);
  console.log(`  language: ${payload.lang}`);
  console.log(`  is_rtl: ${payload.is_rtl}`);
  console.log(`  content_array.length: ${payload.content_array.length}`);
  console.log(`  content_array:`, payload.content_array);
  if (payload.metadata) {
    console.log(`  metadata keys:`, Object.keys(payload.metadata));
  }
  console.groupEnd();
}

/**
 * Log staging result
 * @param source Source module identifier
 * @param result Result from API
 */
export function logStagingResult(source: string, result: Partial<StagingVaultRecord>): void {
  console.group(`[useStaging] [${source.toUpperCase()}] SUCCESS`);
  console.log(`  signal_id: ${result.id}`);
  console.log(`  created_at: ${result.created_at}`);
  console.log(`  signal_type: ${result.signal_type}`);
  console.log(`  language: ${result.language}`);
  console.groupEnd();
}
