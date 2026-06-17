import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OptimizationQueueLocale } from "@/lib/optimization-queue/optimization-queue.types";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import { computeActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-server";

export type QueueHashValidationResult =
  | {
      ok: true;
      clientQueueHash: string;
      serverQueueHash: string;
      itemCount: number;
      clientQueueItemCount?: number;
    }
  | {
      ok: false;
      clientQueueHash: string;
      serverQueueHash: string;
      itemCount: number;
      clientQueueItemCount?: number;
    };

export async function validateActiveContextQueueHash(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    locale: OptimizationQueueLocale;
    appId?: string | null;
    clientQueueHash: string;
    clientQueueItemCount?: number;
  },
): Promise<QueueHashValidationResult> {
  const vaultItems = await readOptimizationQueue(
    supabase,
    args.workspaceId,
    args.locale,
    args.appId,
  );
  const serverQueueHash = computeActiveContextQueueHash(vaultItems, args.locale);

  const base = {
    clientQueueHash: args.clientQueueHash,
    serverQueueHash,
    itemCount: vaultItems.length,
    ...(args.clientQueueItemCount != null
      ? { clientQueueItemCount: args.clientQueueItemCount }
      : {}),
  };

  if (serverQueueHash !== args.clientQueueHash) {
    return { ok: false, ...base };
  }

  return { ok: true, ...base };
}
