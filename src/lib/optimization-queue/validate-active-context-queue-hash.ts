import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OptimizationQueueItem,
  OptimizationQueueLocale,
} from "@/lib/optimization-queue/optimization-queue.types";
import { readOptimizationQueue } from "@/lib/optimization-queue/optimization-queue.service";
import { computeActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-server";
import { resolveQueueItemCategory } from "@/lib/optimization-queue/queue-routing";
import { filterItemsForActiveContextQueueHash } from "@/lib/optimization-queue/optimization-queue-hash-canonical";

export type QueueHashSignalBreakdown = {
  keywordCount: number;
  competitorCount: number;
  reviewCount: number;
  marketCount: number;
};

export type QueueHashValidationResult =
  | {
      ok: true;
      clientQueueHash: string;
      serverQueueHash: string;
      itemCount: number;
      clientQueueItemCount?: number;
      signalBreakdown: QueueHashSignalBreakdown;
      hashFullyPopulated: boolean;
    }
  | {
      ok: false;
      clientQueueHash: string;
      serverQueueHash: string;
      itemCount: number;
      clientQueueItemCount?: number;
      signalBreakdown: QueueHashSignalBreakdown;
      hashFullyPopulated: boolean;
    };

function signalBreakdownFromItems(
  items: OptimizationQueueItem[],
): QueueHashSignalBreakdown {
  const breakdown: QueueHashSignalBreakdown = {
    keywordCount: 0,
    competitorCount: 0,
    reviewCount: 0,
    marketCount: 0,
  };

  for (const item of items) {
    const category = resolveQueueItemCategory(item);
    switch (category) {
      case "tracker":
        breakdown.keywordCount += 1;
        break;
      case "strength":
        breakdown.competitorCount += 1;
        break;
      case "review":
        breakdown.reviewCount += 1;
        break;
      case "opportunity":
        breakdown.marketCount += 1;
        break;
      default:
        break;
    }
  }

  return breakdown;
}

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
  const hashItems = filterItemsForActiveContextQueueHash(vaultItems, args.locale);
  const signalBreakdown = signalBreakdownFromItems(hashItems);
  const hashFullyPopulated =
    signalBreakdown.keywordCount > 0 && signalBreakdown.competitorCount > 0;
  const serverQueueHash = computeActiveContextQueueHash(vaultItems, args.locale);

  const base = {
    clientQueueHash: args.clientQueueHash,
    serverQueueHash,
    itemCount: vaultItems.length,
    signalBreakdown,
    hashFullyPopulated,
    ...(args.clientQueueItemCount != null
      ? { clientQueueItemCount: args.clientQueueItemCount }
      : {}),
  };

  console.log(
    JSON.stringify({
      event: "queue_hash_signal_population",
      workspaceId: args.workspaceId,
      locale: args.locale,
      appId: args.appId ?? null,
      itemCount: vaultItems.length,
      hashItemCount: hashItems.length,
      signalBreakdown,
      hashFullyPopulated,
      hashMatched: serverQueueHash === args.clientQueueHash,
    }),
  );

  if (serverQueueHash !== args.clientQueueHash) {
    return { ok: false, ...base };
  }

  return { ok: true, ...base };
}
