/**
 * VaultCore — strictly typed payloads for workspace_staging_vault writes.
 * All features (Keyword Tracker, Reviews, Market Intel, etc.) must use these types.
 */

export type VaultLocale = "en" | "ar";

export type VaultSignalType =
  | "keyword"
  | "review_issue"
  | "competitor_weakness"
  | "optimization_insight";

export type VaultSignalSource =
  | "keyword_spotlight"
  | "keyword_tracker"
  | "review_analysis"
  | "competitor_spy"
  | "market_intelligence"
  | "manual"
  | "api";

/** Legacy signal-log row (content column) — always written when columns exist. */
export interface VaultLegacySignalPayload {
  type: "legacy_signal";
  workspaceId: string;
  signalType: VaultSignalType;
  content: string;
  source: VaultSignalSource | string;
  locale: VaultLocale;
  sourceAppId?: string;
  sourceContext?: string;
  sourceContextId?: string;
  metadata?: Record<string, unknown>;
  category?: string;
  userId?: string;
  isRtl?: boolean;
  expiresAt?: string;
}

/** Universal vault JSONB state (state_en / state_ar) — producer router path. */
export interface VaultUniversalStatePayload {
  type: "universal_state";
  vault: {
    id?: string;
    workspace_id: string;
    app_id: string;
    state_en: unknown;
    state_ar: unknown;
    active_features?: string[];
    last_modified_by?: string | null;
    change_count?: number;
    updated_at?: string | Date;
    is_deleted?: boolean;
  };
}

/** Universal vault keyword staging (locale-isolated state branch). */
export interface VaultUniversalKeywordPayload {
  type: "universal_keyword";
  workspaceId: string;
  appId: string;
  keyword: string;
  locale: VaultLocale;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export type VaultUpsertPayload =
  | VaultLegacySignalPayload
  | VaultUniversalStatePayload
  | VaultUniversalKeywordPayload;

/** Patch an existing legacy row by id. */
export interface VaultLegacyPatchPayload {
  type: "legacy_patch";
  workspaceId: string;
  id: string;
  patch: {
    deleted_at?: string | null;
    [key: string]: unknown;
  };
}

/** Soft-delete a universal vault row by workspace + app. */
export interface VaultUniversalSoftDeletePayload {
  type: "universal_soft_delete";
  workspaceId: string;
  appId: string;
}

export type VaultUpdatePayload =
  | VaultLegacyPatchPayload
  | VaultUniversalSoftDeletePayload;

export type VaultWritePath = "legacy" | "universal" | "hybrid" | "none";

export interface VaultUpsertResult {
  ok: boolean;
  id?: string;
  writePath: VaultWritePath;
  legacyWritten: boolean;
  universalWritten: boolean;
  message?: string;
  error?: string;
  createdAt?: string;
  /** True when legacy unique constraint hit (idempotent success). */
  idempotent?: boolean;
}

export interface VaultUpdateResult {
  ok: boolean;
  id?: string;
  writePath: VaultWritePath;
  error?: string;
}
