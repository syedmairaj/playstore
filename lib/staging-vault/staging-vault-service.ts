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

  // Validate content
  if (!content || content.trim().length === 0) {
    throw new Error("Signal content cannot be empty");
  }

  if (content.length > 5000) {
    throw new Error("Signal content exceeds 5000 character limit");
  }

  // Validate language code
  if (!/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
    throw new Error("Invalid language code format (use: en, ar, en-US, etc)");
  }

  try {
    const { data, error } = await supabase
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
        metadata,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Failed to add signal: ${error.message}`);
    }

    return {
      id: data.id,
      message: `Signal staged: ${signalType}`,
    };
  } catch (err) {
    console.error("[StagingVault] Add signal failed:", err);
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
