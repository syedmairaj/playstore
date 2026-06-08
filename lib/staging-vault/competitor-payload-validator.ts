/**
 * COMPETITOR PAYLOAD VALIDATOR
 *
 * Enforces strict schema for competitor_weakness signals:
 * {
 *   competitor_id: string (required)
 *   competitor_name: string (required)
 *   language: 'en' | 'ar' (required)
 *   keywords_by_strategy: {
 *     high_volume: string[]
 *     intent_based: string[]
 *     competitor_gap: string[]
 *   }
 *   vulnerabilities?: string[]
 * }
 *
 * Prevents 22P02 JSON serialization errors
 */

export interface CompetitorKeywordPayload {
  competitor_id: string;
  competitor_name: string;
  language: 'en' | 'ar';
  keywords_by_strategy: {
    high_volume: string[];
    intent_based: string[];
    competitor_gap: string[];
  };
  vulnerabilities?: string[];
}

export function validateCompetitorPayload(
  metadata: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // REQUIRED: competitor_id
  if (!metadata?.competitor_id || typeof metadata.competitor_id !== 'string') {
    errors.push('competitor_id is required and must be a string');
  } else if (metadata.competitor_id.trim().length === 0) {
    errors.push('competitor_id cannot be empty');
  }

  // REQUIRED: competitor_name
  if (!metadata?.competitor_name || typeof metadata.competitor_name !== 'string') {
    errors.push('competitor_name is required and must be a string');
  } else if (metadata.competitor_name.trim().length === 0) {
    errors.push('competitor_name cannot be empty');
  }

  // REQUIRED: language
  if (!metadata?.language || !['en', 'ar'].includes(metadata.language)) {
    errors.push("language is required and must be 'en' or 'ar'");
  }

  // REQUIRED: keywords_by_strategy
  if (!metadata?.keywords_by_strategy || typeof metadata.keywords_by_strategy !== 'object') {
    errors.push('keywords_by_strategy is required and must be an object');
  } else {
    const kbs = metadata.keywords_by_strategy;

    if (!Array.isArray(kbs.high_volume)) {
      errors.push('keywords_by_strategy.high_volume must be an array');
    }

    if (!Array.isArray(kbs.intent_based)) {
      errors.push('keywords_by_strategy.intent_based must be an array');
    }

    if (!Array.isArray(kbs.competitor_gap)) {
      errors.push('keywords_by_strategy.competitor_gap must be an array');
    }

    // Warn if all arrays are empty
    const allEmpty =
      (kbs.high_volume?.length === 0 || !kbs.high_volume) &&
      (kbs.intent_based?.length === 0 || !kbs.intent_based) &&
      (kbs.competitor_gap?.length === 0 || !kbs.competitor_gap);

    if (allEmpty) {
      errors.push('At least one keyword array must contain keywords');
    }
  }

  // OPTIONAL but validate if present: vulnerabilities
  if (metadata?.vulnerabilities && !Array.isArray(metadata.vulnerabilities)) {
    errors.push('vulnerabilities must be an array');
  }

  // Test JSON.stringify - will catch circular references
  try {
    JSON.stringify(metadata);
  } catch (err) {
    errors.push(`Metadata contains non-serializable values: ${err}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Transform raw competitor data into valid payload
 * Used when data comes from different sources
 */
export function transformToCompetitorPayload(
  competitorId: string,
  competitorName: string,
  language: 'en' | 'ar',
  keywords: string[],
  vulnerabilities?: string[]
): CompetitorKeywordPayload {
  // Split keywords into strategy groups
  const third = Math.ceil(keywords.length / 3);
  const twoThirds = Math.ceil((keywords.length * 2) / 3);

  return {
    competitor_id: competitorId,
    competitor_name: competitorName,
    language: language,
    keywords_by_strategy: {
      high_volume: keywords.slice(0, third),
      intent_based: keywords.slice(third, twoThirds),
      competitor_gap: keywords.slice(twoThirds),
    },
    vulnerabilities: vulnerabilities || [],
  };
}

/**
 * Validate and return payload, throw if invalid
 */
export function validateOrThrow(metadata: any): CompetitorKeywordPayload {
  const result = validateCompetitorPayload(metadata);

  if (!result.valid) {
    throw new Error(
      `Invalid competitor payload:\n${result.errors.map((e) => `  - ${e}`).join('\n')}`
    );
  }

  return metadata as CompetitorKeywordPayload;
}
