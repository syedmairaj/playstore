/**
 * OptimizationQueueService — single source of truth for curated ASO signals.
 * Stored in workspace_staging_vault state_en / state_ar (locale-isolated).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveVaultAppId } from "@/lib/staging-vault/resolve-vault-app-id";
import { hasUniversalVaultColumns } from "@/lib/staging-vault/staging-vault-schema";
import type {
  AddOptimizationQueueInput,
  OptimizationQueueCategory,
  OptimizationQueueItem,
  OptimizationQueueItemType,
  OptimizationQueueLocale,
  OptimizationQueueState,
  OptimizationQueueStats,
} from "@/lib/optimization-queue/optimization-queue.types";
import {
  assertQueueCategory,
  inferCategoryForInput,
  resolveQueueItemCategory,
  sectionDedupeKey,
} from "@/lib/optimization-queue/queue-routing";
import {
  inferSignalCluster,
  resolveSignalCluster,
  validateManualQueueInput,
  withResolvedSignalCluster,
} from "@/lib/optimization-queue/signal-cluster";
import { enrichStagingVaultMetadata } from "@/lib/staging-vault/staging-vault-metadata";
import {
  isSignalLifecycleStatus,
  readSignalLifecycleStatus,
  SIGNAL_LIFECYCLE_STATUS,
  stripLegacyLifecycleMetadata,
  type SignalLifecycleStatus,
} from "@/lib/signals/signal-lifecycle";
import { demoteCompetitorStrengthItem } from "@/lib/competitor-spy/strength-audit-ssot";

const QUEUE_FEATURE = "optimization_queue";
/** Keep queue bounded so state_en/state_ar JSON stays index-friendly. */
const MAX_ITEMS = 50;
const MAX_CONTENT_LEN = 500;

const ALLOWED_METADATA_KEYS = new Set([
  "category",
  "source_origin",
  "competitor_name",
  "signal_kind",
  "from_review_insights",
  "review_derived",
  "from_gap_analysis",
  "from_keyword_curation",
  "from_gap_analysis",
  "competitor_gap_category",
  "competitor_id",
  "growth_mode",
  "growth_strategy_tag",
  "impactPercent",
  "locale",
  "difficulty",
  "confidence",
  "searchVolume",
  "search_volume",
  "competition",
  "recommendation",
  "monthlyInstalls",
  "severity",
  "impact_percent",
  "description",
  "quote",
  "package_name",
  "country",
  "lang_code",
  "analysis_transaction_id",
  "last_analysis_timestamp",
  "analysis_status",
  "insight_category",
  "pending_insight_id",
  "staged_date",
  "original_staged_at",
  "queue_index",
  "original_impact_score",
  "backlog_id",
  "archive_reason",
  "source_type",
  "explicitly_staged",
  "archived_at",
  "removed_at",
  "audit_item_id",
  "from_strength_audit",
  "strength_class",
  "praise_class",
  "core_differentiator",
  "conversion_impact_score",
  "listing_placement",
  "listing_placements",
  // Market Intel / Active Context canonical fields
  "origin_module",
  "user_selected_boolean",
  "from_keyword_spotlight",
  "active_context_section",
  "confidence_score",
  "data_origin",
  "signal_cluster",
  "cluster_category",
]);

function slimMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_METADATA_KEYS) {
    if (key in metadata) out[key] = metadata[key];
  }
  return out;
}

function throwIfVaultUpdateError(error: { message: string } | null): void {
  if (!error) return;
  if (
    error.message.includes("idx_vault_state_en_features") ||
    error.message.includes("idx_vault_state_ar_features") ||
    error.message.includes("index row size")
  ) {
    throw new Error(
      "Vault JSONB index row size exceeded. Run migration " +
        "20260612100000_drop_vault_features_btree_indexes.sql on Supabase.",
    );
  }
  throw new Error(error.message);
}

function resolveItemLifecycleStatus(
  item: Pick<OptimizationQueueItem, "type" | "status" | "metadata">,
  inputStatus?: SignalLifecycleStatus,
): SignalLifecycleStatus | undefined {
  if (item.type !== "competitor_strength") return undefined;
  if (inputStatus && isSignalLifecycleStatus(inputStatus)) return inputStatus;
  return readSignalLifecycleStatus(item);
}

function normalizeLifecycleFromInput(raw: unknown): SignalLifecycleStatus | undefined {
  if (!isSignalLifecycleStatus(raw)) {
    return readSignalLifecycleStatus({
      type: "competitor_strength",
      metadata: typeof raw === "string" ? { status: raw } : {},
    });
  }
  return raw;
}

function applyLifecycleToItem(
  existing: OptimizationQueueItem,
  status: SignalLifecycleStatus,
  metadataPatch?: Record<string, unknown>,
): OptimizationQueueItem {
  return {
    ...existing,
    status,
    metadata: stripLegacyLifecycleMetadata({
      ...(existing.metadata ?? {}),
      ...(metadataPatch ?? {}),
    }),
  };
}

function slimQueueItem(
  item: OptimizationQueueItem,
  locale: OptimizationQueueLocale,
  now: string,
): OptimizationQueueItem {
  const category = resolveQueueItemCategory(item);
  const meta = stripLegacyLifecycleMetadata(slimMetadata(item.metadata));
  const signalCluster = resolveSignalCluster({
    ...item,
    category,
    metadata: meta,
  });
  const lifecycleStatus = resolveItemLifecycleStatus(item, item.status);
  return {
    id: item.id,
    type: item.type,
    category,
    ...(signalCluster ? { signalCluster } : {}),
    ...(lifecycleStatus ? { status: lifecycleStatus } : {}),
    content: item.content.trim().slice(0, MAX_CONTENT_LEN),
    source: item.source,
    sourceContext: item.sourceContext?.slice(0, 120),
    sourceContextId: item.sourceContextId?.slice(0, 120),
    language: locale,
    stagedAt: item.stagedAt || now,
    metadata: {
      ...meta,
      category,
      source_origin: meta.source_origin ?? item.source,
      ...(signalCluster
        ? { signal_cluster: signalCluster, cluster_category: signalCluster }
        : {}),
    },
  };
}

function emptyQueueState(): OptimizationQueueState {
  return { items: [], updatedAt: new Date().toISOString() };
}

function normalizeQueueItem(
  input: AddOptimizationQueueInput,
  locale: OptimizationQueueLocale,
  now: string,
): OptimizationQueueItem {
  validateManualQueueInput(input);
  const resolvedInput = withResolvedSignalCluster(input);

  const enriched = enrichStagingVaultMetadata({
    signalType: resolvedInput.type,
    source: resolvedInput.source,
    sourceContext: resolvedInput.sourceContext,
    category: resolvedInput.category,
    metadata: resolvedInput.metadata,
    userSelected:
      resolvedInput.metadata?.user_selected_boolean === true ||
      resolvedInput.metadata?.from_keyword_spotlight === true ||
      resolvedInput.metadata?.from_keyword_curation === true,
  });

  const category: OptimizationQueueCategory = assertQueueCategory(
    enriched.active_context_section ?? inferCategoryForInput(resolvedInput),
  );

  const signalCluster = inferSignalCluster({
    ...resolvedInput,
    category,
    metadata: resolvedInput.metadata,
  });

  const metadata = {
    ...enriched,
    category,
    source_origin: enriched.origin_module ?? resolvedInput.source,
    ...(signalCluster
      ? { signal_cluster: signalCluster, cluster_category: signalCluster }
      : {}),
  };

  const stagedAt =
    typeof resolvedInput.metadata?.staged_date === "string" &&
    resolvedInput.metadata.staged_date.trim()
      ? resolvedInput.metadata.staged_date
      : typeof resolvedInput.metadata?.original_staged_at === "string" &&
          resolvedInput.metadata.original_staged_at.trim()
        ? resolvedInput.metadata.original_staged_at
        : now;

  return slimQueueItem(
    {
      id: `oq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: resolvedInput.type,
      category,
      ...(signalCluster ? { signalCluster } : {}),
      ...(resolvedInput.status ? { status: resolvedInput.status } : {}),
      content: resolvedInput.content.trim(),
      source: resolvedInput.source,
      sourceContext: resolvedInput.sourceContext,
      sourceContextId: resolvedInput.sourceContextId,
      language: locale,
      stagedAt,
      metadata,
    },
    locale,
    now,
  );
}

function mergeItemsAtIndex(
  existing: OptimizationQueueItem[],
  added: OptimizationQueueItem[],
  locale: OptimizationQueueLocale,
  now: string,
  insertAtIndex?: number,
): OptimizationQueueItem[] {
  const slimmed = existing.map((i) => slimQueueItem(i, locale, now));
  if (insertAtIndex === undefined) {
    return [...added, ...slimmed].slice(0, MAX_ITEMS);
  }
  const insertAt = Math.min(Math.max(insertAtIndex, 0), slimmed.length);
  return [...slimmed.slice(0, insertAt), ...added, ...slimmed.slice(insertAt)].slice(
    0,
    MAX_ITEMS,
  );
}

function repositionExistingQueueItem(
  items: OptimizationQueueItem[],
  input: AddOptimizationQueueInput,
  locale: OptimizationQueueLocale,
  now: string,
  insertAtIndex: number,
): { items: OptimizationQueueItem[]; changed: boolean; itemId?: string } {
  const candidate = normalizeQueueItem(input, locale, now);
  const key = sectionDedupeKey(candidate);
  const existingIdx = items.findIndex((item) => sectionDedupeKey(item) === key);
  if (existingIdx === -1) return { items, changed: false };

  const slimmed = items.map((i) => slimQueueItem(i, locale, now));
  const [existing] = slimmed.splice(existingIdx, 1);
  const restored: OptimizationQueueItem = {
    ...existing,
    stagedAt: candidate.stagedAt,
    metadata: {
      ...(existing.metadata ?? {}),
      ...candidate.metadata,
    },
  };
  const insertAt = Math.min(Math.max(insertAtIndex, 0), slimmed.length);
  slimmed.splice(insertAt, 0, restored);
  return {
    items: slimmed,
    changed: existingIdx !== insertAt || restored.stagedAt !== existing.stagedAt,
    itemId: restored.id,
  };
}

function parseQueueState(raw: unknown): OptimizationQueueState {
  if (!raw || typeof raw !== "object") return emptyQueueState();
  const o = raw as Record<string, unknown>;
  const items = Array.isArray(o.items) ? (o.items as OptimizationQueueItem[]) : [];
  const now = new Date().toISOString();
  return {
    items: items
      .filter((i) => i && typeof i.id === "string" && typeof i.content === "string")
      .map((i) => slimQueueItem(i, i.language ?? "en", now)),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : now,
  };
}

function stateBranch(
  row: Record<string, unknown>,
  locale: OptimizationQueueLocale,
): Record<string, unknown> {
  const raw = locale === "ar" ? row.state_ar : row.state_en;
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

async function loadVaultRow(
  supabase: SupabaseClient,
  workspaceId: string,
  appId: string,
  locale: OptimizationQueueLocale,
): Promise<{ id: string; stateKey: string; branch: Record<string, unknown>; activeFeatures: string[] } | null> {
  const hasUniversal = await hasUniversalVaultColumns(supabase);
  if (!hasUniversal) return null;

  const stateKey = locale === "ar" ? "state_ar" : "state_en";
  const { data, error } = await supabase
    .from("workspace_staging_vault")
    .select(`id, ${stateKey}, active_features`)
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id),
    stateKey,
    branch: stateBranch(data as Record<string, unknown>, locale),
    activeFeatures: Array.isArray(data.active_features)
      ? (data.active_features as string[])
      : [],
  };
}

/**
 * Auto-bridged review pain points (unpaid sync bridge) are hidden from the public
 * optimization queue read. User-initiated MoveToActiveContext / Stage Issue /
 * Adopt flows are always visible in Active Context.
 */
function isReviewDerivedQueueItem(item: OptimizationQueueItem): boolean {
  if (item.type !== "review_pain_point") return false;

  const meta = item.metadata ?? {};

  if (meta.explicitly_staged === true || meta.move_to_active_context === true) {
    return false;
  }
  if (typeof meta.backlog_id === "string" && meta.backlog_id.length > 0) {
    return false;
  }
  if (typeof meta.pending_insight_id === "string" && meta.pending_insight_id.length > 0) {
    return false;
  }
  if (item.sourceContext === "review_curation_adopt") {
    return false;
  }

  return meta.review_derived === true || meta.from_review_insights === true;
}

export async function readOptimizationQueue(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string | null,
): Promise<OptimizationQueueItem[]> {
  const resolvedAppId = await resolveVaultAppId(supabase, workspaceId, appId);
  if (!resolvedAppId) return [];

  const row = await loadVaultRow(supabase, workspaceId, resolvedAppId, locale);
  if (!row) return [];

  const features = (row.branch.features ?? {}) as Record<string, unknown>;
  const queue = parseQueueState(features[QUEUE_FEATURE]);
  return queue.items
    .filter((i) => i.language === locale)
    .filter((i) => !isReviewDerivedQueueItem(i));
}

export function buildOptimizationQueueStats(
  items: OptimizationQueueItem[],
): OptimizationQueueStats {
  const byType = {
    keyword_gap: 0,
    review_pain_point: 0,
    feature_request: 0,
    competitor_strength: 0,
    competitor_keyword: 0,
    market_keyword: 0,
    competitor_weakness: 0,
  } satisfies Record<OptimizationQueueItemType, number>;
  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
  }
  return {
    total: items.length,
    byType,
    lastSyncAt: new Date().toISOString(),
  };
}

/**
 * Add curated signals to the optimization queue (SSOT).
 * De-duplicates within the same Active Context section (category).
 */
export async function addSignalToQueue(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  inputs: AddOptimizationQueueInput[],
  options?: {
    appId?: string | null;
    userId?: string;
    /** Restore flows — insert at prior queue index instead of prepending. */
    insertAtIndex?: number;
  },
): Promise<{ items: OptimizationQueueItem[]; addedCount: number; skippedCount: number }> {
  const resolvedAppId = await resolveVaultAppId(supabase, workspaceId, options?.appId);
  if (!resolvedAppId) {
    throw new Error("No app found for optimization queue");
  }

  const row = await loadVaultRow(supabase, workspaceId, resolvedAppId, locale);
  if (!row) {
    throw new Error("Universal vault not available");
  }

  const now = new Date().toISOString();
  const features = { ...(row.branch.features as Record<string, unknown>) };
  const queue = parseQueueState(features[QUEUE_FEATURE]);
  const seen = new Set(queue.items.map(sectionDedupeKey));
  const added: OptimizationQueueItem[] = [];
  let skippedCount = 0;
  let lifecycleUpdates = 0;

  for (const input of inputs) {
    const content = input.content.trim();
    if (!content) continue;

    const candidate = normalizeQueueItem(input, locale, now);
    const key = sectionDedupeKey(candidate);
    if (seen.has(key)) {
      const existingIdx = queue.items.findIndex((i) => sectionDedupeKey(i) === key);
      const existing = existingIdx >= 0 ? queue.items[existingIdx] : undefined;
      const rawStatus = candidate.status ?? candidate.metadata?.status;
      const nextStatus =
        candidate.type === "competitor_strength"
          ? normalizeLifecycleFromInput(rawStatus) ?? readSignalLifecycleStatus(candidate)
          : undefined;
      if (
        existing?.type === "competitor_strength" &&
        candidate.type === "competitor_strength" &&
        nextStatus
      ) {
        queue.items[existingIdx] = slimQueueItem(
          applyLifecycleToItem(existing, nextStatus, candidate.metadata),
          locale,
          now,
        );
        lifecycleUpdates += 1;
        continue;
      }
      skippedCount += 1;
      continue;
    }
    seen.add(key);
    added.push(candidate);
  }

  if (added.length === 0 && lifecycleUpdates === 0) {
    if (options?.insertAtIndex !== undefined && inputs.length === 1) {
      const repositioned = repositionExistingQueueItem(
        queue.items,
        inputs[0]!,
        locale,
        now,
        options.insertAtIndex,
      );
      if (repositioned.changed) {
        const nextItems = repositioned.items.slice(0, MAX_ITEMS);
        features[QUEUE_FEATURE] = { items: nextItems, updatedAt: now };
        const nextState = {
          ...row.branch,
          features,
          metadata: {
            ...(row.branch.metadata as Record<string, unknown>),
            last_producer: "optimization_queue",
            last_producer_timestamp: now,
          },
        };
        const activeFeatures = new Set(row.activeFeatures);
        activeFeatures.add(QUEUE_FEATURE);
        const { error } = await supabase
          .from("workspace_staging_vault")
          .update({
            [row.stateKey]: nextState,
            active_features: [...activeFeatures],
            updated_at: now,
            last_modified_by: options?.userId ?? null,
          })
          .eq("id", row.id);
        throwIfVaultUpdateError(error);
        return { items: nextItems, addedCount: 0, skippedCount };
      }
    }
    return { items: queue.items, addedCount: 0, skippedCount };
  }

  if (added.length === 0 && lifecycleUpdates > 0) {
    const nextItems = queue.items.slice(0, MAX_ITEMS);
    features[QUEUE_FEATURE] = { items: nextItems, updatedAt: now };
    const nextState = {
      ...row.branch,
      features,
      metadata: {
        ...(row.branch.metadata as Record<string, unknown>),
        last_producer: "optimization_queue",
        last_producer_timestamp: now,
      },
    };
    const activeFeatures = new Set(row.activeFeatures);
    activeFeatures.add(QUEUE_FEATURE);
    const { error } = await supabase
      .from("workspace_staging_vault")
      .update({
        [row.stateKey]: nextState,
        active_features: [...activeFeatures],
        updated_at: now,
        last_modified_by: options?.userId ?? null,
      })
      .eq("id", row.id);
    throwIfVaultUpdateError(error);
    return { items: nextItems, addedCount: lifecycleUpdates, skippedCount };
  }

  const nextItems = mergeItemsAtIndex(
    queue.items,
    added,
    locale,
    now,
    options?.insertAtIndex,
  );
  features[QUEUE_FEATURE] = { items: nextItems, updatedAt: now };

  const nextState = {
    ...row.branch,
    features,
    metadata: {
      ...(row.branch.metadata as Record<string, unknown>),
      last_producer: "optimization_queue",
      last_producer_timestamp: now,
    },
  };

  const activeFeatures = new Set(row.activeFeatures);
  activeFeatures.add(QUEUE_FEATURE);

  const { error } = await supabase
    .from("workspace_staging_vault")
    .update({
      [row.stateKey]: nextState,
      active_features: [...activeFeatures],
      updated_at: now,
      last_modified_by: options?.userId ?? null,
    })
    .eq("id", row.id);

  throwIfVaultUpdateError(error);

  return { items: nextItems, addedCount: added.length, skippedCount };
}

/** @alias addSignalToQueue */
export const addToOptimizationQueue = addSignalToQueue;

export async function removeFromOptimizationQueue(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  itemId: string,
  options?: { appId?: string | null; userId?: string },
): Promise<boolean> {
  const resolvedAppId = await resolveVaultAppId(supabase, workspaceId, options?.appId);
  if (!resolvedAppId) return false;

  const row = await loadVaultRow(supabase, workspaceId, resolvedAppId, locale);
  if (!row) return false;

  const now = new Date().toISOString();
  const features = { ...(row.branch.features as Record<string, unknown>) };
  const queue = parseQueueState(features[QUEUE_FEATURE]);
  const target = queue.items.find((i) => i.id === itemId);
  if (!target) return false;

  let nextItems: typeof queue.items;
  if (target.type === "competitor_strength") {
    nextItems = queue.items.map((item) =>
      item.id === itemId
        ? slimQueueItem(demoteCompetitorStrengthItem(item), locale, now)
        : item,
    );
  } else {
    nextItems = queue.items.filter((i) => i.id !== itemId);
  }

  features[QUEUE_FEATURE] = { items: nextItems, updatedAt: now };
  const nextState = { ...row.branch, features };

  const { error } = await supabase
    .from("workspace_staging_vault")
    .update({
      [row.stateKey]: nextState,
      updated_at: now,
      last_modified_by: options?.userId ?? null,
    })
    .eq("id", row.id);

  throwIfVaultUpdateError(error);
  return true;
}

/**
 * Read raw queue items including review-derived signals (internal / CreditGate only).
 */
export async function readRawOptimizationQueue(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  appId?: string | null,
): Promise<OptimizationQueueItem[]> {
  const resolvedAppId = await resolveVaultAppId(supabase, workspaceId, appId);
  if (!resolvedAppId) return [];

  const row = await loadVaultRow(supabase, workspaceId, resolvedAppId, locale);
  if (!row) return [];

  const features = (row.branch.features ?? {}) as Record<string, unknown>;
  const queue = parseQueueState(features[QUEUE_FEATURE]);
  return queue.items.filter((i) => i.language === locale);
}

/** Remove all review-derived pain points from the optimization queue vault branch. */
export async function purgeReviewDerivedFromQueue(
  supabase: SupabaseClient,
  workspaceId: string,
  locale: OptimizationQueueLocale,
  options?: { appId?: string | null; userId?: string },
): Promise<number> {
  const resolvedAppId = await resolveVaultAppId(supabase, workspaceId, options?.appId);
  if (!resolvedAppId) return 0;

  const row = await loadVaultRow(supabase, workspaceId, resolvedAppId, locale);
  if (!row) return 0;

  const now = new Date().toISOString();
  const features = { ...(row.branch.features as Record<string, unknown>) };
  const queue = parseQueueState(features[QUEUE_FEATURE]);
  const nextItems = queue.items.filter((i) => !isReviewDerivedQueueItem(i));
  const removed = queue.items.length - nextItems.length;
  if (removed === 0) return 0;

  features[QUEUE_FEATURE] = { items: nextItems, updatedAt: now };
  const nextState = { ...row.branch, features };

  const { error } = await supabase
    .from("workspace_staging_vault")
    .update({
      [row.stateKey]: nextState,
      updated_at: now,
      last_modified_by: options?.userId ?? null,
    })
    .eq("id", row.id);

  throwIfVaultUpdateError(error);
  return removed;
}
