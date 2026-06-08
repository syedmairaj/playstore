/**
 * Universal Stage Signal Utility
 *
 * Unified, standardized function for staging any signal across all modules:
 * - Common Issues (review analysis)
 * - Competitor Spy (competitor weakness, sentiment)
 * - Keywords (spotlight, tracker alerts)
 * - Market Intel
 * - Manual staging
 *
 * Key Improvements:
 * ✅ Enforces source_context and source_context_id (prevents null references)
 * ✅ Auto-calculates is_rtl based on language
 * ✅ Validates metadata structure (severity, impactPercent, etc.)
 * ✅ Supports all signal types with consistent interface
 * ✅ Language-aware field preservation (EN/AR)
 * ✅ Rich error messages for debugging
 *
 * Context Binding Examples:
 * - Common Issues: source_context='common_issues_theme', source_context_id={issue_id}
 * - Competitor Spy: source_context='competitor_weakness', source_context_id={competitor_package}
 * - Keywords: source_context='keyword_spotlight', source_context_id={keyword_id}
 * - Market Intel: source_context='market_opportunity', source_context_id={market_id}
 */

import { SupabaseClient } from "@supabase/supabase-js";

// ── Type Definitions ──────────────────────────────────────────────────
export type SignalType =
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight";

export type SourceContext =
  | "common_issues_theme"
  | "competitor_weakness"
  | "competitor_sentiment"
  | "keyword_spotlight"
  | "keyword_tracker_alert"
  | "market_opportunity"
  | "listing_analysis"
  | "manual";

export type SignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "market_intelligence"
  | "manual"
  | "api";

// ── Metadata Validation Types ─────────────────────────────────────────
export interface BaseMetadata {
  description?: string;
  severity?: "critical" | "high" | "medium" | "low";
  impactPercent?: number;
  [key: string]: unknown;
}

export interface ReviewMetadata extends BaseMetadata {
  topQuote?: string;
  quoteCount?: number;
  sentimentScore?: number;
}

export interface CompetitorMetadata extends BaseMetadata {
  competitorName?: string;
  marketShare?: number;
  rating?: number;
}

export interface KeywordMetadata extends BaseMetadata {
  searchVolume?: number;
  difficulty?: number;
  rank?: number;
}

// ── Main StageSignal Request Interface ─────────────────────────────────
export interface StageSignalRequest {
  // Required fields
  workspace_id: string;
  signal_type: SignalType;
  source: SignalSource;
  source_context: SourceContext;
  source_context_id: string;
  content: string;
  language: "en" | "ar";

  // Optional fields
  source_app_id?: string;
  metadata?: BaseMetadata | ReviewMetadata | CompetitorMetadata | KeywordMetadata;
  expires_at?: string;
}

// ── Response Interface ────────────────────────────────────────────────
export interface StageSignalResponse {
  id: string;
  success: boolean;
  message: string;
  signal: {
    id: string;
    workspace_id: string;
    signal_type: SignalType;
    content: string;
    language: string;
    is_rtl: boolean;
    source_context: string;
    source_context_id: string;
    created_at: string;
  };
}

// ── Validation Utilities ──────────────────────────────────────────────
/**
 * Validate language code and return is_rtl flag
 * RTL languages: ar (Arabic), he (Hebrew), fa (Persian), ur (Urdu)
 */
function validateLanguageAndGetRTL(language: string): {
  valid: boolean;
  isRtl: boolean;
  error?: string;
} {
  const rtlLanguages = ["ar", "he", "fa", "ur"];
  const languageBase = language.split("-")[0].toLowerCase();

  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
    return {
      valid: false,
      isRtl: false,
      error: `Invalid language format: "${language}". Use: en, ar, en-US, ar-SA, etc.`,
    };
  }

  return {
    valid: true,
    isRtl: rtlLanguages.includes(languageBase),
    error: undefined,
  };
}

/**
 * Validate metadata structure
 * Ensures metadata is a valid object with expected fields
 */
function validateMetadata(metadata: unknown): {
  valid: boolean;
  error?: string;
  sanitized?: Record<string, unknown>;
} {
  // Metadata is optional
  if (metadata === undefined || metadata === null) {
    return { valid: true, sanitized: {} };
  }

  // Must be an object
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    return {
      valid: false,
      error: `Metadata must be a JSON object, received: ${typeof metadata}`,
    };
  }

  // Validate specific fields if present
  const meta = metadata as Record<string, unknown>;

  // severity: if present, must be valid enum
  if ("severity" in meta && meta.severity) {
    const validSeverities = ["critical", "high", "medium", "low"];
    if (!validSeverities.includes(meta.severity as string)) {
      return {
        valid: false,
        error: `Invalid severity: "${meta.severity}". Must be one of: ${validSeverities.join(", ")}`,
      };
    }
  }

  // impactPercent: if present, must be 0-100
  if ("impactPercent" in meta && meta.impactPercent !== undefined) {
    const impact = meta.impactPercent as number;
    if (typeof impact !== "number" || impact < 0 || impact > 100) {
      return {
        valid: false,
        error: `Invalid impactPercent: ${impact}. Must be a number between 0 and 100`,
      };
    }
  }

  return { valid: true, sanitized: meta };
}

/**
 * Validate source context binding
 * Ensures source_context and source_context_id are properly paired
 */
function validateSourceContext(
  sourceContext: string,
  sourceContextId: string
): {
  valid: boolean;
  error?: string;
} {
  // Both must be non-empty strings
  if (!sourceContext || typeof sourceContext !== "string") {
    return {
      valid: false,
      error: `source_context is required and must be a non-empty string`,
    };
  }

  if (!sourceContextId || typeof sourceContextId !== "string") {
    return {
      valid: false,
      error: `source_context_id is required and must be a non-empty string`,
    };
  }

  // source_context must be one of the valid types
  const validContexts: SourceContext[] = [
    "common_issues_theme",
    "competitor_weakness",
    "competitor_sentiment",
    "keyword_spotlight",
    "keyword_tracker_alert",
    "market_opportunity",
    "listing_analysis",
    "manual",
  ];

  if (!validContexts.includes(sourceContext as SourceContext)) {
    return {
      valid: false,
      error: `Invalid source_context: "${sourceContext}". Must be one of: ${validContexts.join(", ")}`,
    };
  }

  return { valid: true };
}

// ── Main Stage Signal Function ────────────────────────────────────────
/**
 * Stage a signal to the workspace staging vault
 *
 * Universal function used across all modules to ensure consistent context binding,
 * language preservation, and metadata validation.
 *
 * @param supabase - Supabase client (with auth context)
 * @param request - Complete signal data with context binding
 * @returns Promise with staged signal details
 *
 * @example
 * // Common Issues Module
 * await stageSignal(supabase, {
 *   workspace_id: "ws-123",
 *   signal_type: "review_issue",
 *   source: "review_analysis",
 *   source_context: "common_issues_theme",
 *   source_context_id: "theme-456",
 *   content: "App crashes on startup",
 *   language: "en",
 *   metadata: {
 *     severity: "critical",
 *     impactPercent: 45,
 *     description: "Users cannot launch app",
 *     quoteCount: 12
 *   }
 * });
 *
 * @example
 * // Competitor Spy Module
 * await stageSignal(supabase, {
 *   workspace_id: "ws-123",
 *   signal_type: "competitor_weakness",
 *   source: "competitor_spy",
 *   source_context: "competitor_weakness",
 *   source_context_id: "com.competitor.app",
 *   content: "Missing dark mode support",
 *   language: "en",
 *   metadata: {
 *     competitorName: "CompetitorApp Pro",
 *     severity: "high",
 *     rating: 4.2
 *   }
 * });
 *
 * @example
 * // Keywords Module (Arabic)
 * await stageSignal(supabase, {
 *   workspace_id: "ws-123",
 *   signal_type: "keyword",
 *   source: "keyword_spotlight",
 *   source_context: "keyword_spotlight",
 *   source_context_id: "kw-789",
 *   content: "تحسين الأداء",
 *   language: "ar",
 *   metadata: {
 *     searchVolume: 15000,
 *     difficulty: 42,
 *     impactPercent: 28
 *   }
 * });
 */
export async function stageSignal(
  supabase: SupabaseClient,
  request: StageSignalRequest
): Promise<StageSignalResponse> {
  const {
    workspace_id,
    signal_type,
    source,
    source_context,
    source_context_id,
    content,
    language,
    source_app_id,
    metadata,
    expires_at,
  } = request;

  // ── Step 1: Validate Content ────────────────────────────────────────
  if (!content || content.trim().length === 0) {
    throw new Error(
      "[StageSignal] Validation failed: Signal content cannot be empty"
    );
  }

  if (content.length > 5000) {
    throw new Error(
      `[StageSignal] Validation failed: Signal content exceeds 5000 character limit (got ${content.length})`
    );
  }

  // ── Step 2: Validate Language and Get RTL Flag ────────────────────
  const languageValidation = validateLanguageAndGetRTL(language);
  if (!languageValidation.valid) {
    throw new Error(
      `[StageSignal] Validation failed: ${languageValidation.error}`
    );
  }

  // ── Step 3: Validate Source Context Binding ────────────────────────
  const contextValidation = validateSourceContext(
    source_context,
    source_context_id
  );
  if (!contextValidation.valid) {
    throw new Error(
      `[StageSignal] Validation failed: ${contextValidation.error}`
    );
  }

  // ── Step 4: Validate Metadata ──────────────────────────────────────
  const metadataValidation = validateMetadata(metadata);
  if (!metadataValidation.valid) {
    throw new Error(
      `[StageSignal] Validation failed: ${metadataValidation.error}`
    );
  }

  // ── Step 5: Get Current User ───────────────────────────────────────
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "[StageSignal] Authentication failed: User not authenticated"
    );
  }

  // ── Step 6: Insert Into Database ───────────────────────────────────
  try {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .insert({
        workspace_id,
        signal_type,
        source,
        source_context,
        source_context_id,
        content: content.trim(),
        language,
        is_rtl: languageValidation.isRtl,
        source_app_id,
        metadata: metadataValidation.sanitized || {},
        expires_at,
        created_by_user_id: user.id,
      })
      .select("id, workspace_id, signal_type, content, language, is_rtl, source_context, source_context_id, created_at")
      .single();

    if (error) {
      throw new Error(`Database insert failed: ${error.message}`);
    }

    console.info(`[StageSignal] Successfully staged ${signal_type}`, {
      id: data.id,
      workspace_id,
      source_context,
      source_context_id,
      language,
      is_rtl: languageValidation.isRtl,
    });

    return {
      id: data.id,
      success: true,
      message: `Signal staged successfully: ${signal_type} from ${source_context}`,
      signal: {
        id: data.id,
        workspace_id: data.workspace_id,
        signal_type: data.signal_type as SignalType,
        content: data.content,
        language: data.language,
        is_rtl: data.is_rtl,
        source_context: data.source_context,
        source_context_id: data.source_context_id,
        created_at: data.created_at,
      },
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[StageSignal] Failed to stage signal:", {
      workspace_id,
      signal_type,
      source_context,
      source_context_id,
      error: errorMessage,
    });
    throw err;
  }
}

// ── Helper: Filter Signals by Source Context ────────────────────────
/**
 * Filter staged signals by source context
 * Useful for AI Listing Optimizer to group signals by origin
 *
 * @param signals - Array of staged signals
 * @param sourceContext - Context to filter by
 * @returns Filtered signals
 */
export function filterSignalsBySourceContext(
  signals: any[],
  sourceContext: SourceContext
) {
  return signals.filter((s) => s.source_context === sourceContext);
}

// ── Helper: Group Signals by Source Context ────────────────────────
/**
 * Group signals by their source context
 * Returns object with context keys and signal arrays
 *
 * @param signals - Array of all staged signals
 * @returns Signals grouped by source_context
 */
export function groupSignalsBySourceContext(signals: any[]) {
  const grouped: Record<SourceContext, any[]> = {
    common_issues_theme: [],
    competitor_weakness: [],
    competitor_sentiment: [],
    keyword_spotlight: [],
    keyword_tracker_alert: [],
    market_opportunity: [],
    listing_analysis: [],
    manual: [],
  };

  signals.forEach((signal) => {
    const context = signal.source_context as SourceContext;
    if (context in grouped) {
      grouped[context].push(signal);
    }
  });

  return grouped;
}

/**
 * Export all types for use in components and utilities
 */
export type { StageSignalRequest, StageSignalResponse };
