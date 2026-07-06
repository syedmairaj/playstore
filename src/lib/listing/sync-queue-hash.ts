import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const QUEUE_HASH_RE = /^[a-f0-9]{64}$/;

export type SyncQueueHashParams = {
  workspaceId: string;
  appId: string;
  activeQueueHash: string;
  /** When set, only stamp the EN or AR vault branch. */
  vaultLocale?: OptimizationQueueLocale;
};

export type SyncQueueHashResult =
  | { ok: true; updatedCount: number }
  | { ok: false; message: string };

/**
 * Claims staged Keyword Tracker rows for the active optimization queue hash.
 * Mirrors: UPDATE workspace_keywords SET queue_hash = … WHERE workspace_id, app_id, is_staged.
 */
export async function syncQueueHash(
  params: SyncQueueHashParams,
  supabase?: SupabaseClient,
): Promise<SyncQueueHashResult> {
  const workspaceId = params.workspaceId.trim();
  const appId = params.appId.trim();
  const activeQueueHash = params.activeQueueHash.trim();

  if (!workspaceId || !appId) {
    return { ok: false, message: "workspaceId and appId are required" };
  }
  if (!QUEUE_HASH_RE.test(activeQueueHash)) {
    return { ok: false, message: "activeQueueHash must be a 64-char hex string" };
  }

  let client = supabase;
  try {
    client = client ?? getSupabaseAdmin();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin client unavailable";
    return { ok: false, message };
  }

  let query = client
    .from("workspace_keywords")
    .update({ queue_hash: activeQueueHash })
    .eq("workspace_id", workspaceId)
    .eq("app_id", appId)
    .eq("is_staged", true);

  if (params.vaultLocale) {
    query = query.eq("locale", params.vaultLocale);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.warn(
      JSON.stringify({
        event: "queue_hash_stamp_failed",
        workspaceId,
        appId,
        activeQueueHash,
        vaultLocale: params.vaultLocale ?? null,
        message: error.message,
      }),
    );
    return { ok: false, message: error.message };
  }

  return { ok: true, updatedCount: data?.length ?? 0 };
}

/** @deprecated Use `syncQueueHash`. */
export const syncStagedKeywordsQueueHash = syncQueueHash;
