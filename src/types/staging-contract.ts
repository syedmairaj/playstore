/**
 * STAGING VAULT UNIFIED CONTRACT
 *
 * This file defines the standardized interface that ALL staging operations
 * must conform to. It serves as the single source of truth for payload structure,
 * ensuring consistency across Keyword Gaps, Review Insights, Asset Audits, and
 * any future features that interact with workspace_staging_vault.
 *
 * Key Principles:
 * 1. Language-aware: Every payload MUST include 'lang' (en/ar)
 * 2. RTL-ready: is_rtl boolean computed from lang
 * 3. Array-based content: content_array ensures consistent structure
 * 4. Backward compatible: Maps to existing DB schema
 */

/**
 * Language codes supported by the system
 */
export type LanguageCode = 'en' | 'ar';

/**
 * RTL Language Detection
 * These languages are rendered right-to-left
 */
const RTL_LANGUAGES: LanguageCode[] = ['ar'];

/**
 * Unified Staging Payload Contract
 *
 * All features MUST build payloads conforming to this structure.
 * Maps to workspace_staging_vault schema with these fields:
 * - source → source
 * - category → source_context
 * - intent → signal_type (competitor_weakness | review_issue | keyword | optimization_insight)
 * - content_array → content (JSON stringified) + metadata (JSONB object)
 * - lang → language
 * - is_rtl → (computed, not stored, used for UI rendering)
 */
export interface UnifiedStagingPayload {
  /**
   * Module source identifier
   * Examples: 'competitor_spy', 'review_analysis', 'keyword_tracker', 'market_intelligence'
   */
  source: string;

  /**
   * Category/context for the signal
   * Maps to source_context in DB
   * Examples: 'competitor_weakness', 'review_issue', 'keyword', 'optimization_insight'
   */
  category: string;

  /**
   * Signal intent/type
   * Maps to signal_type in DB
   * Examples: 'competitor_weakness', 'review_issue', 'keyword', 'optimization_insight'
   */
  intent: string;

  /**
   * Primary content array
   * Contains the main data payload for this signal
   * Examples:
   *   - Keywords array: ['fitness tracker', 'calorie counter', ...]
   *   - Review issues: ['grammar error', 'missing feature', ...]
   *   - Asset issues: ['low contrast image', 'missing description', ...]
   */
  content_array: (string | Record<string, any>)[];

  /**
   * User's active language (from useLocale())
   * Determines which language strategy AI Optimizer uses
   * CRITICAL: Every signal MUST declare its language
   */
  lang: LanguageCode;

  /**
   * RTL flag (computed from lang)
   * Set to true when lang === 'ar'
   * Used for UI rendering: dir="rtl", flex-row-reverse, etc.
   */
  is_rtl: boolean;

  /**
   * Optional: Source app ID (UUID)
   * References the app being analyzed
   * Example: '550e8400-e29b-41d4-a716-446655440000'
   */
  sourceAppId?: string;

  /**
   * Optional: Source context ID
   * Additional context identifier
   * Example: 'com.fittrack.pro' (competitor package ID)
   */
  sourceContextId?: string;

  /**
   * Optional: Workspace ID (UUID)
   * Should be passed by parent component
   * Example: 'workspace-uuid-here'
   */
  workspaceId?: string;

  /**
   * Optional: Additional metadata
   * Stored as JSONB in DB for flexible querying
   * Examples:
   *   - { competitorName: 'FitTrack Pro', bestRank: 42, categoryLabel: 'Health & Fitness' }
   *   - { severity: 'critical', impactPercent: 45 }
   *   - { contrastRatio: 2.1, wcagLevel: 'FAIL' }
   */
  metadata?: Record<string, any>;

  /**
   * Optional: Human-readable title for this signal
   * Used in UI displays
   * Example: 'Competitor Weakness from FitTrack Pro'
   */
  title?: string;

  /**
   * Optional: Verbose description
   * Used for audit trails and detailed displays
   * Example: 'Found 12 high-volume keywords that FitTrack targets but HealthHub does not'
   */
  description?: string;
}

/**
 * Database Payload Transformation
 *
 * Maps UnifiedStagingPayload to workspace_staging_vault schema
 * This is used internally by useStaging hook and utilities
 */
export interface StagingVaultRecord {
  id?: string; // UUID, set by DB
  workspace_id: string;
  signal_type: string;
  source: string;
  source_context: string;
  source_context_id?: string;
  source_app_id?: string;
  content: string; // JSON string of content_array
  metadata: Record<string, any>;
  language: LanguageCode;
  created_at?: string; // ISO timestamp
  updated_at?: string; // ISO timestamp
}

/**
 * Hook Return Type
 * What useStaging returns to consuming components
 */
export interface UseStagingReturn {
  /**
   * Add a signal to the staging vault
   * @param payload Unified staging payload
   * @returns Promise<{ id: string; created_at: string }>
   */
  stage: (payload: UnifiedStagingPayload) => Promise<void>;

  /**
   * Current loading state
   */
  loading: boolean;

  /**
   * Current "staged" confirmation state
   */
  staged: boolean;

  /**
   * Error message if staging failed
   */
  error: string | null;

  /**
   * Reset states (for retry or new operation)
   */
  reset: () => void;

  /**
   * User's detected language
   */
  language: LanguageCode;

  /**
   * Computed RTL flag
   */
  isRtl: boolean;
}

/**
 * UI Component Props for StagingButton
 * All staging buttons will accept props conforming to this
 */
export interface StagingButtonProps {
  /**
   * The payload to stage when button is clicked
   */
  payload: UnifiedStagingPayload;

  /**
   * Callback after successful staging
   */
  onStaged?: () => void;

  /**
   * Button display variant
   */
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';

  /**
   * Button size
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Custom button label (defaults to 'Add to Queue')
   */
  label?: string;

  /**
   * Additional CSS classes
   */
  className?: string;

  /**
   * Disable the button
   */
  disabled?: boolean;

  /**
   * Show an icon
   */
  showIcon?: boolean;

  /**
   * Custom icons (default: Zap for primary, Archive for secondary)
   */
  iconLoading?: React.ReactNode;
  iconSuccess?: React.ReactNode;
}

/**
 * Helper: Compute is_rtl from language code
 */
export function isRtlLanguage(lang: LanguageCode): boolean {
  return RTL_LANGUAGES.includes(lang);
}

/**
 * Helper: Validate payload structure
 * Returns { valid: boolean; errors: string[] }
 */
export function validateStagingPayload(
  payload: Partial<UnifiedStagingPayload>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!payload.source?.trim()) errors.push('source is required');
  if (!payload.category?.trim()) errors.push('category is required');
  if (!payload.intent?.trim()) errors.push('intent is required');
  if (!Array.isArray(payload.content_array) || payload.content_array.length === 0) {
    errors.push('content_array must be a non-empty array');
  }
  if (!payload.lang || !['en', 'ar'].includes(payload.lang)) {
    errors.push("lang must be 'en' or 'ar'");
  }
  if (typeof payload.is_rtl !== 'boolean') {
    errors.push('is_rtl must be a boolean');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Helper: Build payload with defaults
 * Simplifies payload construction in components
 */
export function buildStagingPayload(
  source: string,
  category: string,
  intent: string,
  content_array: (string | Record<string, any>)[],
  lang: LanguageCode,
  overrides?: Partial<UnifiedStagingPayload>
): UnifiedStagingPayload {
  return {
    source,
    category,
    intent,
    content_array,
    lang,
    is_rtl: isRtlLanguage(lang),
    ...overrides,
  };
}

/**
 * Helper: Transform UnifiedStagingPayload to DB schema
 * Used by useStaging hook
 */
export function transformToVaultRecord(
  payload: UnifiedStagingPayload,
  workspaceId: string
): Omit<StagingVaultRecord, 'id' | 'created_at' | 'updated_at'> {
  return {
    workspace_id: workspaceId,
    signal_type: payload.intent,
    source: payload.source,
    source_context: payload.category,
    source_context_id: payload.sourceContextId,
    source_app_id: payload.sourceAppId,
    content: JSON.stringify(payload.content_array),
    metadata: {
      ...(payload.metadata || {}),
      content_array: payload.content_array, // Redundancy for retrieval
      lang: payload.lang,
      is_rtl: payload.is_rtl,
    },
    language: payload.lang,
  };
}
