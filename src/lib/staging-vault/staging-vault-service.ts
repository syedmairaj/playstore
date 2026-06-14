/**
 * Staging Vault Service — feature-facing facade over VaultCore.
 *
 * All INSERT/UPDATE operations delegate to VaultCore.safeUpsert / safeUpdate.
 * Legacy content column is always written when available (backward compatible reads).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { KeywordPayload } from "@/hooks/useKeywordSelection";
import { VaultCore } from "@/lib/staging-vault/vault-core";
import type { VaultSignalType } from "@/lib/staging-vault/vault-core.types";
import { hasLegacySignalColumns } from "@/lib/staging-vault/staging-vault-schema";

export type VaultListSignalType =
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight"
  | "optimizer_selection";

export type VaultSignalRow = {
  id: string;
  workspace_id: string;
  signal_type: VaultListSignalType;
  content: string;
  source: string;
  source_app_id?: string | null;
  source_context?: string | null;
  source_context_id?: string | null;
  language?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

export type VaultSignalsGrouped = {
  keywords: VaultSignalRow[];
  reviewIssues: VaultSignalRow[];
  competitorWeaknesses: VaultSignalRow[];
  optimizationInsights: VaultSignalRow[];
  optimizerSelections: VaultSignalRow[];
  total: number;
  lastUpdated: string;
};

const EMPTY_GROUPED: VaultSignalsGrouped = {
  keywords: [],
  reviewIssues: [],
  competitorWeaknesses: [],
  optimizationInsights: [],
  optimizerSelections: [],
  total: 0,
  lastUpdated: new Date().toISOString(),
};

function groupVaultSignals(signals: VaultSignalRow[]): VaultSignalsGrouped {
  return {
    keywords: signals.filter((s) => s.signal_type === "keyword"),
    reviewIssues: signals.filter((s) => s.signal_type === "review_issue"),
    competitorWeaknesses: signals.filter((s) => s.signal_type === "competitor_weakness"),
    optimizationInsights: signals.filter((s) => s.signal_type === "optimization_insight"),
    optimizerSelections: signals.filter((s) => s.signal_type === "optimizer_selection"),
    total: signals.length,
    lastUpdated: new Date().toISOString(),
  };
}

export interface AddSignalPayload {
  signalType: string;
  content: string;
  source: string;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  language: "en" | "ar";
  metadata: Record<string, unknown>;
  keywords?: KeywordPayload[];
  category?: string;
}

export interface StagingVaultResult {
  id: string;
  workspaceId: string;
  signalType: string;
  message: string;
  createdAt: string;
}

export async function addSignalToVault(
  supabase: SupabaseClient,
  workspaceId: string,
  payload: AddSignalPayload,
  options?: { userId?: string },
): Promise<StagingVaultResult> {
  const vaultLocale: "en" | "ar" = String(payload.language).startsWith("ar") ? "ar" : "en";

  console.log("[StagingVaultService] 📝 ADDING SIGNAL via VaultCore:", {
    signalType: payload.signalType,
    source: payload.source,
    language: vaultLocale,
    workspaceId,
  });

  const result = await VaultCore.safeUpsert(supabase, {
    type: "legacy_signal",
    workspaceId,
    signalType: payload.signalType as VaultSignalType,
    content: payload.content,
    source: payload.source,
    locale: vaultLocale,
    sourceAppId: payload.sourceAppId,
    sourceContext: payload.sourceContext,
    sourceContextId: payload.sourceContextId,
    metadata: {
      ...payload.metadata,
      keywords: payload.keywords ?? [],
    },
    category: payload.category,
    userId: options?.userId,
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to add signal to vault");
  }

  return {
    id: result.id!,
    workspaceId,
    signalType: payload.signalType,
    message:
      result.message ??
      `Signal added to vault (${payload.keywords?.length ?? 0} keywords) via ${result.writePath}`,
    createdAt: result.createdAt ?? new Date().toISOString(),
  };
}

/**
 * List legacy vault signals grouped by type (staging/list API).
 * Returns empty groups when legacy columns are not deployed.
 */
export async function listVaultSignals(
  supabase: SupabaseClient,
  workspaceId: string,
  filters?: {
    signalType?: VaultListSignalType;
    language?: string;
    sourceAppId?: string;
    limit?: number;
  },
): Promise<VaultSignalsGrouped> {
  const { signalType, language, sourceAppId, limit = 1000 } = filters ?? {};

  const legacyAvailable = await hasLegacySignalColumns(supabase);
  if (!legacyAvailable) {
    console.warn(
      "[StagingVaultService] listVaultSignals: legacy columns unavailable, returning empty groups",
    );
    return { ...EMPTY_GROUPED, lastUpdated: new Date().toISOString() };
  }

  let query = supabase
    .from("workspace_staging_vault")
    .select(
      "id, workspace_id, signal_type, content, source, source_app_id, source_context, source_context_id, language, metadata, created_at, deleted_at",
      { count: "exact" },
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (signalType) {
    query = query.eq("signal_type", signalType);
  }
  if (language) {
    query = query.eq("language", language);
  }
  if (sourceAppId) {
    query = query.eq("source_app_id", sourceAppId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list signals: ${error.message} (${error.code})`);
  }

  return groupVaultSignals((data ?? []) as VaultSignalRow[]);
}

export async function getStagingVaultItems(
  supabase: SupabaseClient,
  workspaceId: string,
  options: { includeDeleted?: boolean } = {},
) {
  const { includeDeleted = false } = options;

  let query = supabase
    .from("workspace_staging_vault")
    .select(
      `id, workspace_id, signal_type, content, source, source_app_id, source_context, source_context_id, language, metadata, created_at, deleted_at`,
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch staging items: ${error.message} (${error.code})`);
  }

  return data || [];
}

export async function archiveStagingItem(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string,
) {
  const result = await VaultCore.safeUpdate(supabase, {
    type: "legacy_patch",
    workspaceId,
    id: itemId,
    patch: { deleted_at: new Date().toISOString() },
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to archive item");
  }

  return { success: true, itemId };
}

export async function restoreStagingItem(
  supabase: SupabaseClient,
  workspaceId: string,
  itemId: string,
) {
  const result = await VaultCore.safeUpdate(supabase, {
    type: "legacy_patch",
    workspaceId,
    id: itemId,
    patch: { deleted_at: null },
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Failed to restore item");
  }

  return { success: true, itemId };
}
