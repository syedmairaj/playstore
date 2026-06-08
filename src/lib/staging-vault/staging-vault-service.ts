/**
 * Staging Vault Service Layer
 *
 * Unified API for managing workspace staging vault signals.
 * Replaces transient 'Send to Optimizer' navigation pattern.
 *
 * Features:
 * - Add signals (keywords, review issues, competitor insights)
 * - List current vault context
 * - Delete signals (soft delete)
 * - RTL/LTR preservation
 * - Workspace isolation via RLS
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { validateCompetitorWeaknessSchema } from "./BRAND-MIRROR-ENGINE-SCHEMA";

/**
 * Signal type enum (matches database)
 */
export type SignalType =
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight";

/**
 * Signal source enum (matches database)
 */
export type SignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "manual"
  | "api";

/**
 * Add Signal to Staging Vault
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param signal - Signal content + metadata
 * @returns Created signal record
 */
export async function addSignalToVault(
  supabase: SupabaseClient,
  workspaceId: string,
  signal: {
    signalType: SignalType;
    content: string;
    source?: SignalSource;
    sourceAppId?: string;
    sourceContext?: string;
    sourceContextId?: string;
    language?: string;
    metadata?: Record<string, unknown>;
    expiresAt?: string;
  }
): Promise<{
  id: string;
  message: string;
}> {
  // ═════════════════════════════════════════════════════════════════════════
  // DEBUG TRACER #1: Log full signal object at function entry
  // Shows exactly what is being passed to the vault
  // ═════════════════════════════════════════════════════════════════════════
  console.log('[StagingVault] 🔍 ENTRY - Full signal object:', {
    signalType: signal.signalType,
    language: signal.language || 'en (default)',
    metadataProvided: !!signal.metadata,
    metadataType: typeof signal.metadata,
    metadataKeys: signal.metadata ? Object.keys(signal.metadata) : [],
    competitorIdValue: (signal.metadata as any)?.competitor_id,
    competitorIdType: typeof (signal.metadata as any)?.competitor_id,
    contentLength: signal.content?.length || 0,
    source: signal.source || 'manual (default)',
    sourceAppId: signal.sourceAppId,
    workspaceId,
    timestamp: new Date().toISOString(),
  });

  const {
    signalType,
    content,
    source = "manual",
    sourceAppId,
    sourceContext,
    sourceContextId,
    language = "en",
    metadata = {},
    expiresAt,
  } = signal;

  // ═════════════════════════════════════════════════════════════════════════
  // DEBUG TRACER #2: Validate content - expose failures immediately
  // ═════════════════════════════════════════════════════════════════════════

  // Validate content
  if (!content || content.trim().length === 0) {
    const errorMsg = "Signal content cannot be empty";
    console.error('[StagingVault] ❌ VALIDATION FAILED - Content is empty:', {
      signalType,
      language,
      competitorId: (metadata as any)?.competitor_id,
      workspaceId,
    });
    throw new Error(errorMsg);
  }

  if (content.length > 5000) {
    const errorMsg = `Signal content exceeds 5000 character limit (length: ${content.length})`;
    console.error('[StagingVault] ❌ VALIDATION FAILED - Content too long:', {
      signalType,
      language,
      competitorId: (metadata as any)?.competitor_id,
      contentLength: content.length,
      workspaceId,
    });
    throw new Error(errorMsg);
  }

  // Validate language code
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
    const errorMsg = `Invalid language code format: "${language}" (use: en, ar, en-US, etc)`;
    console.error('[StagingVault] ❌ VALIDATION FAILED - Invalid language:', {
      signalType,
      language,
      competitorId: (metadata as any)?.competitor_id,
      workspaceId,
    });
    throw new Error(errorMsg);
  }

  try {
    // ═══════════════════════════════════════════════════════════════════
    // CRITICAL VALIDATION: Ensure metadata is JSON-serializable
    // This prevents 22P02: invalid input syntax for type json errors
    // ═══════════════════════════════════════════════════════════════════

    const finalMetadata = metadata || {};

    console.log('[StagingVault] 🔍 METADATA CHECK #1 - Type validation:', {
      finalMetadataType: typeof finalMetadata,
      isObject: typeof finalMetadata === 'object',
      isNotNull: finalMetadata !== null,
      isNotArray: !Array.isArray(finalMetadata),
      competitorId: (finalMetadata as any)?.competitor_id,
      signalType,
    });

    // Check 1: Is it an object?
    if (typeof finalMetadata !== 'object' || finalMetadata === null || Array.isArray(finalMetadata)) {
      const errorMsg = `Metadata must be an object. Got: ${typeof finalMetadata} (${JSON.stringify(finalMetadata)})`;
      console.error('[StagingVault] ❌ VALIDATION FAILED - Metadata type error:', {
        expectedType: 'object',
        actualType: typeof finalMetadata,
        isNull: finalMetadata === null,
        isArray: Array.isArray(finalMetadata),
        signalType,
        competitorId: (finalMetadata as any)?.competitor_id,
      });
      throw new Error(errorMsg);
    }

    // Check 2: Can we stringify it? (catches circular references)
    let metadataString: string;
    try {
      metadataString = JSON.stringify(finalMetadata);
      console.log('[StagingVault] 🔍 METADATA CHECK #2 - JSON.stringify succeeded:', {
        stringLength: metadataString.length,
        competitorId: (finalMetadata as any)?.competitor_id,
      });
    } catch (stringifyErr) {
      const errorMsg = `Metadata contains non-serializable values (circular reference?): ${stringifyErr}`;
      console.error('[StagingVault] ❌ VALIDATION FAILED - JSON stringify error:', {
        error: String(stringifyErr),
        metadataKeys: Object.keys(finalMetadata),
        signalType,
        competitorId: (finalMetadata as any)?.competitor_id,
      });
      throw new Error(errorMsg);
    }

    // Check 3: Can we parse it back?
    try {
      JSON.parse(metadataString);
      console.log('[StagingVault] 🔍 METADATA CHECK #3 - Round-trip JSON succeeded:', {
        competitorId: (finalMetadata as any)?.competitor_id,
        metadataKeys: Object.keys(finalMetadata),
      });
    } catch (parseErr) {
      const errorMsg = `Metadata failed round-trip JSON serialization: ${parseErr}`;
      console.error('[StagingVault] ❌ VALIDATION FAILED - JSON parse error:', {
        error: String(parseErr),
        stringifiedMetadata: metadataString.substring(0, 200),
        signalType,
        competitorId: (finalMetadata as any)?.competitor_id,
      });
      throw new Error(errorMsg);
    }

    // Check 4: For competitor_weakness signals, verify competitor_id exists
    if (signalType === 'competitor_weakness') {
      console.log('[StagingVault] 🔍 METADATA CHECK #4 - competitor_weakness specific validation:', {
        hasCompetitorId: !!finalMetadata.competitor_id,
        competitorIdType: typeof (finalMetadata as any)?.competitor_id,
        competitorIdValue: (finalMetadata as any)?.competitor_id,
        competitorIdLength: typeof (finalMetadata as any)?.competitor_id === 'string' ? (finalMetadata as any)?.competitor_id.length : 'N/A',
      });

      if (!finalMetadata.competitor_id || typeof finalMetadata.competitor_id !== 'string') {
        const errorMsg = `competitor_weakness signals MUST have metadata.competitor_id as string. Got: ${JSON.stringify(finalMetadata.competitor_id)}`;
        console.error('[StagingVault] ❌ VALIDATION FAILED - Missing or wrong-type competitor_id:', {
          competitorIdProvided: !!finalMetadata.competitor_id,
          competitorIdType: typeof (finalMetadata as any)?.competitor_id,
          competitorIdValue: (finalMetadata as any)?.competitor_id,
          allMetadataKeys: Object.keys(finalMetadata),
          metadataKeys: Object.keys(finalMetadata),
          signalType,
        });
        throw new Error(errorMsg);
      }

      if ((finalMetadata as any).competitor_id.trim().length === 0) {
        const errorMsg = `competitor_weakness signals MUST have non-empty metadata.competitor_id. Got empty string.`;
        console.error('[StagingVault] ❌ VALIDATION FAILED - Empty competitor_id:', {
          competitorIdValue: (finalMetadata as any)?.competitor_id,
          competitorIdTrimmedLength: (finalMetadata as any)?.competitor_id.trim().length,
          signalType,
        });
        throw new Error(errorMsg);
      }
    }

    console.log(`[StagingVault] ✓ METADATA VALIDATION PASSED for ${signalType}:`, {
      hasCompetitorId: !!finalMetadata.competitor_id,
      competitorId: (finalMetadata as any)?.competitor_id,
      metadataSize: metadataString.length,
      metadataKeys: Object.keys(finalMetadata),
      language,
    });

    // ═══════════════════════════════════════════════════════════════════════
    // SCHEMA ENFORCEMENT: For competitor_weakness, validate strict schema
    // ═══════════════════════════════════════════════════════════════════════
    if (signalType === 'competitor_weakness') {
      console.log('[StagingVault] 🔍 SCHEMA VALIDATION STARTED for competitor_weakness:', {
        competitorId: (finalMetadata as any)?.competitor_id,
        language,
        contentLength: content.trim().length,
        metadataKeys: Object.keys(finalMetadata),
      });

      const schemaValidation = validateCompetitorWeaknessSchema({
        workspace_id: workspaceId,
        signal_type: signalType,
        source,
        source_context: sourceContext,
        source_context_id: sourceContextId,
        content: content.trim(),
        language,
        metadata: finalMetadata,
      });

      if (!schemaValidation.valid) {
        const errorMsg = schemaValidation.errors.join('\n');
        console.error('[StagingVault] ❌ SCHEMA VALIDATION FAILED:', {
          competitorId: (finalMetadata as any)?.competitor_id,
          language,
          signalType,
          validationErrors: schemaValidation.errors,
          errorMessage: errorMsg,
        });
        throw new Error(`Schema validation failed:\n${errorMsg}`);
      }

      console.log(`[StagingVault] ✓ SCHEMA VALIDATION PASSED for competitor_weakness:`, {
        competitorId: (finalMetadata as any)?.competitor_id,
        language: language,
        metadataKeys: Object.keys(finalMetadata),
        validationStatus: 'PASSED',
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // INSERT: metadata is NATIVE OBJECT (NOT stringified)
    // Supabase will automatically serialize to JSONB
    // ═══════════════════════════════════════════════════════════════════════

    console.log(`[StagingVault] 🔍 ABOUT TO INSERT signal:`, {
      workspaceId,
      signalType,
      language,
      metadataType: typeof finalMetadata,
      metadataKeys: Object.keys(finalMetadata),
      competitorId: (finalMetadata as any)?.competitor_id,
      metadataFullContent: JSON.stringify(finalMetadata),
      allInsertFields: {
        workspace_id: workspaceId,
        signal_type: signalType,
        source,
        content_length: content.trim().length,
        language,
        source_app_id: sourceAppId,
        source_context: sourceContext,
        source_context_id: sourceContextId,
        metadata: finalMetadata,
        expires_at: expiresAt,
      },
    });

    // ═══════════════════════════════════════════════════════════════════════
    // INSERT: Handle duplicate constraint gracefully
    // If this competitor/language/workspace combo already exists, that's OK
    // Just treat it as a successful "no-op" instead of failing
    // ═══════════════════════════════════════════════════════════════════════

    let data: any;
    let error: any;
    let insertMethod = 'INSERT';
    let generatedSignalId = '';

    // First, try insert
    const insertResult = await supabase
      .from("workspace_staging_vault")
      .insert({
        workspace_id: workspaceId,
        signal_type: signalType,
        source,
        content: content.trim(),
        language,
        source_app_id: sourceAppId,
        source_context: sourceContext,
        source_context_id: sourceContextId,
        metadata: finalMetadata,  // ← NATIVE OBJECT (Supabase handles JSONB serialization)
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    data = insertResult.data;
    error = insertResult.error;

    // If duplicate constraint error (23505), that's OK - data already exists
    // Treat as success since the user's intent (to stage this competitor) is satisfied
    if (error && (error as any)?.code === '23505') {
      console.log('[StagingVault] 🔄 DUPLICATE DETECTED - This competitor signal already staged:', {
        errorCode: (error as any)?.code,
        competitorId: (finalMetadata as any)?.competitor_id,
        language,
        signalType,
        message: 'Treating as success (already in vault)',
      });

      insertMethod = 'DUPLICATE (no-op)';
      // Generate a pseudo-ID for logging purposes (not used further)
      generatedSignalId = `existing-${workspaceId}-${signalType}`;
      // Clear the error since we're treating it as success
      error = null;
      data = { id: generatedSignalId };
    }

    if (error) {
      console.error('[StagingVault] ❌ DATABASE INSERT ERROR:', {
        method: insertMethod,
        errorCode: (error as any)?.code,
        errorMessage: error.message,
        errorDetails: error,
        signalType,
        competitorId: (finalMetadata as any)?.competitor_id,
        language,
        workspaceId,
      });
      throw new Error(
        `Failed to add signal: ${error.message}\n` +
        `Error code: ${(error as any)?.code}\n` +
        `Signal type: ${signalType}\n` +
        `Method: ${insertMethod}`
      );
    }

    console.log('[StagingVault] ✅ SUCCESS - Signal staged:', {
      method: insertMethod,
      signalId: data.id,
      signalType,
      competitorId: (finalMetadata as any)?.competitor_id,
      language,
      workspaceId,
      contentLength: content.trim().length,
      metadataKeys: Object.keys(finalMetadata),
      metadataStructure: JSON.stringify(finalMetadata),
      timestamp: new Date().toISOString(),
    });

    // ═════════════════════════════════════════════════════════════════════════
    // VERIFICATION: Immediately read back to confirm data was actually inserted
    // ═════════════════════════════════════════════════════════════════════════
    console.log('[StagingVault] 🔍 VERIFICATION - Checking if data actually made it to DB...');

    const { data: verifyData, error: verifyError } = await supabase
      .from('workspace_staging_vault')
      .select('id, signal_type, language, metadata, created_at')
      .eq('workspace_id', workspaceId)
      .eq('signal_type', signalType)
      .eq('language', language)
      .filter("metadata->>'competitor_id'", 'eq', (finalMetadata as any)?.competitor_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (verifyError) {
      console.warn('[StagingVault] ⚠️ VERIFICATION QUERY FAILED:', {
        errorCode: (verifyError as any)?.code,
        errorMessage: verifyError.message,
        hint: 'Data may exist but query filter is not matching',
      });
    } else if (verifyData) {
      console.log('[StagingVault] ✓ VERIFICATION PASSED - Data is in database:', {
        verified_id: verifyData.id,
        verified_signal_type: verifyData.signal_type,
        verified_language: verifyData.language,
        verified_competitor_id: (verifyData.metadata as any)?.competitor_id,
        verified_created_at: verifyData.created_at,
      });
    } else {
      console.error('[StagingVault] ❌ VERIFICATION FAILED - No data found after insert!', {
        workspaceId,
        signalType,
        language,
        competitorId: (finalMetadata as any)?.competitor_id,
        hint: 'Data was not actually inserted to database. Check RLS policies.',
      });
    }

    return {
      id: data.id,
      message: `Signal staged: ${signalType}`,
    };
  } catch (err) {
    console.error("[StagingVault] ❌ CATCH BLOCK - Add signal failed:", {
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : 'No stack available',
      fullError: err,
      signalType,
      language,
      competitorId: (metadata as any)?.competitor_id,
      workspaceId,
    });
    throw err;
  }
}

/**
 * List all signals in vault for a workspace
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param filters - Optional filters (type, language, source)
 * @returns Array of signals grouped by type
 */
export async function listVaultSignals(
  supabase: SupabaseClient,
  workspaceId: string,
  filters?: {
    signalType?: SignalType;
    language?: string;
    sourceAppId?: string;
    limit?: number;
  }
): Promise<{
  keywords: VaultSignal[];
  reviewIssues: VaultSignal[];
  competitorWeaknesses: VaultSignal[];
  optimizationInsights: VaultSignal[];
  total: number;
  lastUpdated: string;
}> {
  const { signalType, language, sourceAppId, limit = 1000 } = filters || {};

  try {
    let query = supabase
      .from("workspace_staging_vault")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    // Apply filters
    if (signalType) {
      query = query.eq("signal_type", signalType);
    }

    if (language) {
      query = query.eq("language", language);
    }

    if (sourceAppId) {
      query = query.eq("source_app_id", sourceAppId);
    }

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to list signals: ${error.message}`);
    }

    // Group by signal type
    const signals = (data || []) as VaultSignal[];
    const grouped = {
      keywords: signals.filter((s) => s.signal_type === "keyword"),
      reviewIssues: signals.filter((s) => s.signal_type === "review_issue"),
      competitorWeaknesses: signals.filter(
        (s) => s.signal_type === "competitor_weakness"
      ),
      optimizationInsights: signals.filter(
        (s) => s.signal_type === "optimization_insight"
      ),
      total: count || 0,
      lastUpdated: new Date().toISOString(),
    };

    return grouped;
  } catch (err) {
    console.error("[StagingVault] List signals failed:", err);
    throw err;
  }
}

/**
 * Delete signal (soft delete)
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param signalId - Signal to delete
 */
export async function deleteSignal(
  supabase: SupabaseClient,
  workspaceId: string,
  signalId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("id", signalId)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error(`Failed to delete signal: ${error.message}`);
    }
  } catch (err) {
    console.error("[StagingVault] Delete signal failed:", err);
    throw err;
  }
}

/**
 * Get vault summary for a specific app
 * Used by Brand Mirror Engine and Consultant Layer
 *
 * @param supabase - Supabase client
 * @param workspaceId - Target workspace
 * @param appId - Target app
 * @returns Vault context for generation
 */
export async function getAppVaultContext(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string
): Promise<AppVaultContext> {
  try {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("source_app_id", appId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to get app context: ${error.message}`);
    }

    const signals = (data || []) as VaultSignal[];

    return {
      appId,
      hasVaultContent: signals.length > 0,
      keywords: signals
        .filter((s) => s.signal_type === "keyword")
        .map((s) => ({
          content: s.content,
          language: s.language,
          isRtl: s.is_rtl,
          source: s.source,
          sourceContext: s.source_context,
        })),
      reviewIssues: signals
        .filter((s) => s.signal_type === "review_issue")
        .map((s) => ({
          content: s.content,
          language: s.language,
          isRtl: s.is_rtl,
          metadata: s.metadata,
        })),
      competitorWeaknesses: signals
        .filter((s) => s.signal_type === "competitor_weakness")
        .map((s) => ({
          content: s.content,
          language: s.language,
          isRtl: s.is_rtl,
          competitorId: s.source_context_id,
        })),
      totalSignals: signals.length,
    };
  } catch (err) {
    console.error("[StagingVault] Get app context failed:", err);
    // Return empty context on error (graceful degradation)
    return {
      appId,
      hasVaultContent: false,
      keywords: [],
      reviewIssues: [],
      competitorWeaknesses: [],
      totalSignals: 0,
    };
  }
}

/**
 * Clear all signals for an app (admin use)
 */
export async function clearAppVault(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("workspace_staging_vault")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: (await supabase.auth.getUser()).data.user?.id,
      })
      .eq("workspace_id", workspaceId)
      .eq("source_app_id", appId)
      .is("deleted_at", null)
      .select("id");

    if (error) {
      throw new Error(`Failed to clear vault: ${error.message}`);
    }

    return (data || []).length;
  } catch (err) {
    console.error("[StagingVault] Clear vault failed:", err);
    throw err;
  }
}

/**
 * Type definitions
 */
export interface VaultSignal {
  id: string;
  workspace_id: string;
  signal_type: SignalType;
  source: SignalSource;
  content: string;
  language: string;
  is_rtl: boolean;
  source_app_id?: string;
  source_context?: string;
  source_context_id?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by_user_id?: string;
  expires_at?: string;
  deleted_at?: string;
}

export interface AppVaultContext {
  appId: string;
  hasVaultContent: boolean;
  keywords: Array<{
    content: string;
    language: string;
    isRtl: boolean;
    source: SignalSource;
    sourceContext?: string;
  }>;
  reviewIssues: Array<{
    content: string;
    language: string;
    isRtl: boolean;
    metadata: Record<string, unknown>;
  }>;
  competitorWeaknesses: Array<{
    content: string;
    language: string;
    isRtl: boolean;
    competitorId?: string;
  }>;
  totalSignals: number;
}
