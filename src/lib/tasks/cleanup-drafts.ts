import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type CleanupDraftsOptions = {
  /** Rows older than this many days are eligible (default: 7). */
  olderThanDays?: number;
  /**
   * Maximum rows to delete in one call (default: 200).
   * Keeps individual query cost low — schedule multiple runs for large backlogs.
   */
  batchSize?: number;
};

export type CleanupDraftsResult = {
  ok: boolean;
  deletedCount: number;
  error?: string;
};

/**
 * Safe server-side cleanup task for `workspace_listing_drafts`.
 *
 * Deletes rows where:
 *   - `updated_at` is older than `olderThanDays` days, AND
 *   - `generation_status` is NOT "processing"  (never touch in-flight jobs)
 *
 * Rules:
 *   - Caller must provide a Supabase **admin** (service-role) client.
 *   - "processing" rows are always preserved — stuck jobs need manual review.
 *   - "completed" and "failed" rows are cleaned up; "pending" rows older than
 *     the window are also cleaned (timed-out enqueues that were never picked up).
 *
 * Intended to run as a scheduled Vercel Cron or Supabase Edge Function.
 */
export async function cleanupStaleDrafts(
  supabase: SupabaseClient,
  options?: CleanupDraftsOptions,
): Promise<CleanupDraftsResult> {
  const olderThanDays = options?.olderThanDays ?? 7;
  const batchSize = options?.batchSize ?? 200;
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  // First, fetch the IDs to delete (avoids a DELETE … NOT IN which can be slow).
  const { data: candidates, error: selectError } = await supabase
    .from("workspace_listing_drafts")
    .select("id")
    .lt("updated_at", cutoff)
    .not("generation_status", "eq", "processing")
    .limit(batchSize);

  if (selectError) {
    console.error(
      JSON.stringify({
        event: "cleanup_drafts_select_failed",
        error: selectError.message,
        cutoff,
      }),
    );
    return { ok: false, deletedCount: 0, error: selectError.message };
  }

  if (!candidates || candidates.length === 0) {
    console.log(
      JSON.stringify({ event: "cleanup_drafts_noop", cutoff, batchSize }),
    );
    return { ok: true, deletedCount: 0 };
  }

  const ids = candidates.map((r: { id: string }) => r.id);

  const { error: deleteError } = await supabase
    .from("workspace_listing_drafts")
    .delete()
    .in("id", ids);

  if (deleteError) {
    console.error(
      JSON.stringify({
        event: "cleanup_drafts_delete_failed",
        error: deleteError.message,
        candidateCount: ids.length,
      }),
    );
    return { ok: false, deletedCount: 0, error: deleteError.message };
  }

  console.log(
    JSON.stringify({
      event: "cleanup_drafts_completed",
      deletedCount: ids.length,
      cutoff,
    }),
  );

  return { ok: true, deletedCount: ids.length };
}
