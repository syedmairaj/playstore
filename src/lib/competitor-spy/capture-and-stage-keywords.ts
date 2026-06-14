/**
 * COMPETITOR KEYWORDS CAPTURE & STAGING SERVICE
 *
 * This is the SINGLE SOURCE OF TRUTH for:
 * 1. Capturing competitor keyword analysis results
 * 2. Validating data before database insert
 * 3. Logging exact JSON structure being sent
 * 4. Handling EN/AR language variants
 *
 * CRITICAL: This prevents null competitor_id and 22P02 errors
 */

import type { LanguageCode } from '@/types/staging-contract';

export interface CompetitorAnalysisResult {
  competitorId: string;           // REQUIRED: com.fittrack.pro
  competitorName: string;         // REQUIRED: FitTrack Pro
  categoryLabel: string;          // REQUIRED: Health & Fitness
  keywords: string[];             // REQUIRED: ['fitness', 'tracker']
  vulnerabilities: string[];      // OPTIONAL: []
  workspaceId: string;            // REQUIRED: ws-123
  /** Workspace app UUID — required for universal vault (state_en/state_ar). */
  appId?: string;
  language: LanguageCode;         // REQUIRED: en | ar
  isRtl: boolean;                 // REQUIRED: false | true
}

/**
 * Sanitize competitor name - use fallback if empty
 */
function sanitizeCompetitorName(name: string | undefined, fallback: string): string {
  if (name && typeof name === 'string' && name.trim()) {
    return name.trim();
  }
  return fallback || 'Unknown Competitor';
}

/**
 * STEP 1: VALIDATE BEFORE ANYTHING ELSE
 * Catches issues immediately - logs exact problems
 */
export function validateCompetitorAnalysisResult(
  data: any
): { valid: boolean; errors: string[]; data?: CompetitorAnalysisResult } {
  const errors: string[] = [];

  // Check competitorId
  if (!data?.competitorId || typeof data.competitorId !== 'string' || !data.competitorId.trim()) {
    errors.push(
      `❌ competitorId is REQUIRED and must be non-empty string. Got: ${JSON.stringify(data?.competitorId)}`
    );
  }

  // Check competitorName
  if (!data?.competitorName || typeof data.competitorName !== 'string' || !data.competitorName.trim()) {
    errors.push(
      `❌ competitorName is REQUIRED and must be non-empty string. Got: ${JSON.stringify(data?.competitorName)}`
    );
  }

  // Check categoryLabel
  if (!data?.categoryLabel || typeof data.categoryLabel !== 'string' || !data.categoryLabel.trim()) {
    errors.push(
      `❌ categoryLabel is REQUIRED and must be non-empty string. Got: ${JSON.stringify(data?.categoryLabel)}`
    );
  }

  // Check keywords
  if (!Array.isArray(data?.keywords)) {
    errors.push(
      `❌ keywords MUST be an array. Got: ${typeof data?.keywords} = ${JSON.stringify(data?.keywords)}`
    );
  } else if (data.keywords.length === 0) {
    errors.push(`❌ keywords array is EMPTY. Must have at least 1 keyword.`);
  } else {
    const nonStrings = data.keywords.filter((k: any) => typeof k !== 'string');
    if (nonStrings.length > 0) {
      errors.push(
        `❌ keywords array has non-string elements: ${JSON.stringify(nonStrings)}`
      );
    }
  }

  // Check vulnerabilities
  if (!Array.isArray(data?.vulnerabilities)) {
    errors.push(
      `⚠️  vulnerabilities should be an array. Got: ${typeof data?.vulnerabilities}`
    );
  }

  // Check workspaceId
  if (!data?.workspaceId || typeof data.workspaceId !== 'string' || !data.workspaceId.trim()) {
    errors.push(
      `❌ workspaceId is REQUIRED and must be non-empty string. Got: ${JSON.stringify(data?.workspaceId)}`
    );
  }

  // Check language
  if (!data?.language || !['en', 'ar'].includes(data.language)) {
    errors.push(
      `❌ language must be 'en' or 'ar'. Got: ${JSON.stringify(data?.language)}`
    );
  }

  // Check isRtl
  if (typeof data?.isRtl !== 'boolean') {
    errors.push(
      `❌ isRtl must be boolean. Got: ${typeof data?.isRtl} = ${JSON.stringify(data?.isRtl)}`
    );
  }

  if (errors.length === 0) {
    return {
      valid: true,
      errors: [],
      data: data as CompetitorAnalysisResult,
    };
  }

  return {
    valid: false,
    errors,
  };
}

/**
 * STEP 2: LOG EXACT JSON STRUCTURE
 * Shows precisely what will be sent to Supabase
 */
export function logCompetitorAnalysisPayload(data: CompetitorAnalysisResult): void {
  console.log('\n' + '='.repeat(80));
  console.log('🔍 COMPETITOR ANALYSIS CAPTURE - PRE-DATABASE LOG');
  console.log('='.repeat(80));

  // Log each field
  console.log(`✓ competitorId: ${JSON.stringify(data.competitorId)}`);
  console.log(`✓ competitorName: ${JSON.stringify(data.competitorName)}`);
  console.log(`✓ categoryLabel: ${JSON.stringify(data.categoryLabel)}`);
  console.log(`✓ keywords.length: ${data.keywords.length}`);
  console.log(`  Sample keywords: ${JSON.stringify(data.keywords.slice(0, 3))}`);
  console.log(`✓ vulnerabilities.length: ${data.vulnerabilities.length}`);
  console.log(`✓ workspaceId: ${JSON.stringify(data.workspaceId)}`);
  console.log(`✓ language: ${JSON.stringify(data.language)}`);
  console.log(`✓ isRtl: ${data.isRtl}`);

  // Show the EXACT metadata object that will go to database
  const metadata = {
    competitor_id: data.competitorId,
    competitor_name: data.competitorName,
    category_label: data.categoryLabel,
    language: data.language,
    category: 'competitor_keyword',  // ✅ CATEGORIZE: Routes to Competitor Keywords bucket
    keywords_by_strategy: {
      high_volume: data.keywords.slice(0, Math.ceil(data.keywords.length / 3)),
      intent_based: data.keywords.slice(
        Math.ceil(data.keywords.length / 3),
        Math.ceil((data.keywords.length * 2) / 3)
      ),
      competitor_gap: data.keywords.slice(Math.ceil((data.keywords.length * 2) / 3)),
    },
    // ✅ EXTRACTION: Store keywords as array with categories for UI extraction
    keywords: data.keywords.map((keyword, index) => ({
      term: keyword,
      category: index < Math.ceil(data.keywords.length / 3)
        ? 'high_volume'
        : index < Math.ceil((data.keywords.length * 2) / 3)
        ? 'intent_based'
        : 'competitor_gap',
    })),
    vulnerabilities: data.vulnerabilities,
    is_rtl: data.isRtl,
  };

  console.log('\n📦 METADATA OBJECT (will be stored in DB):');
  console.log(JSON.stringify(metadata, null, 2));

  // Verify JSON.stringify works (catches circular references)
  try {
    const stringified = JSON.stringify(metadata);
    console.log(`✓ JSON.stringify succeeded. Size: ${stringified.length} bytes`);
  } catch (err) {
    console.error(`❌ JSON.stringify FAILED: ${err}`);
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * STEP 3: PREPARE VAULT PAYLOAD
 * Transforms validated data into the exact structure for workspace_staging_vault
 */
export function prepareVaultPayload(data: CompetitorAnalysisResult): {
  workspace_id: string;
  signal_type: string;
  source: string;
  source_context: string;
  source_context_id: string;
  content: string;
  language: LanguageCode;
  metadata: Record<string, any>;
} {
  const metadata = {
    competitor_id: data.competitorId,  // ← CRITICAL: This is what GET endpoint searches for
    competitor_name: data.competitorName,
    category_label: data.categoryLabel,
    language: data.language,
    category: 'competitor_keyword',  // ✅ CATEGORIZE: Routes to Competitor Keywords bucket
    keywords_by_strategy: {
      high_volume: data.keywords.slice(0, Math.ceil(data.keywords.length / 3)),
      intent_based: data.keywords.slice(
        Math.ceil(data.keywords.length / 3),
        Math.ceil((data.keywords.length * 2) / 3)
      ),
      competitor_gap: data.keywords.slice(Math.ceil((data.keywords.length * 2) / 3)),
    },
    // ✅ EXTRACTION: Store keywords as array with categories for UI extraction
    keywords: data.keywords.map((keyword, index) => ({
      term: keyword,
      category: index < Math.ceil(data.keywords.length / 3)
        ? 'high_volume'
        : index < Math.ceil((data.keywords.length * 2) / 3)
        ? 'intent_based'
        : 'competitor_gap',
    })),
    vulnerabilities: data.vulnerabilities,
    is_rtl: data.isRtl,
  };

  // Verify metadata is JSON-serializable BEFORE creating payload
  try {
    JSON.stringify(metadata);
  } catch (err) {
    throw new Error(`Metadata failed JSON serialization: ${err}`);
  }

  return {
    workspace_id: data.workspaceId,
    signal_type: 'competitor_weakness',
    source: 'competitor_spy',
    source_context: 'competitor_weakness',
    source_context_id: data.competitorId,
    content: JSON.stringify({
      keywords: data.keywords,
      vulnerabilities: data.vulnerabilities,
      language: data.language,
    }),
    language: data.language,
    metadata,  // ← This is the JSONB column that must be valid JSON
  };
}

/**
 * STEP 4: EXECUTE INSERT WITH COMPREHENSIVE LOGGING
 * Posts to Supabase with detailed error handling
 */
export async function stageCompetitorAnalysis(
  data: CompetitorAnalysisResult,
  workspaceIdForApi: string  // Passed separately to avoid confusion
): Promise<{ success: boolean; error?: string; signalId?: string }> {
  console.log(`[StageCompetitorAnalysis] Starting for competitor: ${data.competitorId}`);

  // Sanitize competitor name before processing - use ID as fallback if needed
  const sanitizedData = {
    ...data,
    competitorName: sanitizeCompetitorName(data.competitorName, data.competitorId),
  };

  // Step 1: Validate
  const validation = validateCompetitorAnalysisResult(sanitizedData);
  if (!validation.valid) {
    const errorMsg = validation.errors.join('\n');
    console.error('❌ VALIDATION FAILED:\n' + errorMsg);
    return { success: false, error: errorMsg };
  }

  console.log('✓ Validation passed');

  // Step 2: Log payload
  logCompetitorAnalysisPayload(sanitizedData);

  // Step 3: Prepare vault payload
  let vaultPayload;
  try {
    vaultPayload = prepareVaultPayload(sanitizedData);
    console.log('✓ Vault payload prepared');
  } catch (err) {
    const errorMsg = `Failed to prepare vault payload: ${err}`;
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  // Step 4: POST to API
  try {
    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #1: Log EXACT request body before sending
    // ═════════════════════════════════════════════════════════════════════
    const requestPayload = {
      signalType: 'competitor_weakness',
      content: vaultPayload.content,
      source: 'competitor_spy',
      sourceContext: 'competitor_weakness',
      sourceContextId: sanitizedData.competitorId,
      language: sanitizedData.language,
      metadata: vaultPayload.metadata,
      category: 'competitor_keyword',
      ...(sanitizedData.appId ? { sourceAppId: sanitizedData.appId } : {}),
    };

    console.log(
      `\n[StageCompetitorAnalysis] 🔍 REQUEST BODY - About to POST to /api/workspaces/${workspaceIdForApi}/staging/add`
    );
    console.log('Request payload:');
    console.log(JSON.stringify(requestPayload, null, 2));
    console.log(`Metadata type: ${typeof requestPayload.metadata}`);
    console.log(`Metadata.competitor_id: ${(requestPayload.metadata as any)?.competitor_id}`);
    console.log(`Metadata.competitor_name: ${(requestPayload.metadata as any)?.competitor_name} (sanitized from: ${data.competitorName})`);

    const response = await fetch(`/api/workspaces/${workspaceIdForApi}/staging/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    // ═════════════════════════════════════════════════════════════════════
    // DEBUG TRACER #2: Log response status and body
    // ═════════════════════════════════════════════════════════════════════
    console.log(`\n[StageCompetitorAnalysis] 📡 RESPONSE - Status: ${response.status}`);

    const responseText = await response.text();
    console.log(`Response body: ${responseText}`);

    if (!response.ok) {
      const errorMsg = `API returned ${response.status}: ${responseText}`;
      console.error(`❌ ${errorMsg}`);
      return { success: false, error: errorMsg };
    }

    // Parse successful response
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseErr) {
      console.error(`❌ Failed to parse API response: ${parseErr}`);
      return { success: false, error: `Failed to parse API response: ${parseErr}` };
    }

    console.log('✓ Successfully staged competitor analysis');
    console.log(`  Signal ID: ${result.data?.id}`);
    console.log(`[StageCompetitorAnalysis] ✅ SUCCESS - Competitor weakness signal inserted`);

    return {
      success: true,
      signalId: result.data?.id,
    };
  } catch (err) {
    const errorMsg = `Failed to stage: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`❌ ${errorMsg}`);
    console.error(`[StageCompetitorAnalysis] Full error:`, err);
    return { success: false, error: errorMsg };
  }
}
